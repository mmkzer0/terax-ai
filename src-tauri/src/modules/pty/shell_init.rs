// Shell integration layer.
//
// Emits OSC 7 (current working directory) and OSC 133 A/B/C/D
// (prompt-start / prompt-end / pre-exec / command-done-with-exit-code) so the
// frontend can detect command boundaries and track cwd without re-parsing the
// prompt.
//
// Safety notes:
// - Files are written atomically (tmp + rename) to avoid a half-written rc
//   being sourced by a parallel shell spawn.
// - Nested shells are guarded by $__TERAX_HOOKS_LOADED so we never double-install.
// - User's existing ZDOTDIR is preserved via TERAX_USER_ZDOTDIR — otherwise a
//   user with `ZDOTDIR=~/.config/zsh` would have every `$ZDOTDIR/...` path in
//   their config silently point at our cache dir.
// - PS1/PS0 markers are re-injected on every prompt in case the user's framework
//   (powerlevel10k, starship) rebuilds the prompt string.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use portable_pty::CommandBuilder;

pub enum Shell {
    Zsh,
    Bash,
    Other,
}

impl Shell {
    pub fn detect() -> (Shell, String) {
        let path = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let name = path.rsplit('/').next().unwrap_or("").to_string();
        let shell = match name.as_str() {
            "zsh" => Shell::Zsh,
            "bash" => Shell::Bash,
            _ => Shell::Other,
        };
        (shell, path)
    }
}

pub fn build_command(cwd: Option<String>) -> Result<CommandBuilder, String> {
    let (shell, shell_path) = Shell::detect();
    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERAX_TERMINAL", "1");

    let resolved_cwd = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| std::env::current_dir().ok());
    if let Some(cwd) = resolved_cwd {
        cmd.cwd(cwd);
    }

    match shell {
        Shell::Zsh => {
            match prepare_zdotdir() {
                Ok(zdotdir) => {
                    // Preserve the user's ZDOTDIR (if any) so our integration
                    // scripts can source their real config from the right place.
                    if let Ok(user_zd) = std::env::var("ZDOTDIR") {
                        cmd.env("TERAX_USER_ZDOTDIR", user_zd);
                    }
                    cmd.env("ZDOTDIR", zdotdir);
                }
                Err(e) => {
                    log::warn!("zsh shell integration disabled: {e}");
                }
            }
            // Login shell so /etc/zprofile runs → path_helper on macOS injects
            // Homebrew/user bins into PATH. Without this, apps launched from
            // Finder/Dock get a minimal PATH.
            cmd.arg("-l");
        }
        Shell::Bash => {
            match prepare_bash_rcfile() {
                Ok(rc) => {
                    cmd.arg("--rcfile");
                    cmd.arg(rc);
                }
                Err(e) => {
                    log::warn!("bash shell integration disabled: {e}");
                }
            }
            // NOT passing `-l`: bash ignores --rcfile for login shells. We
            // emulate login-shell init inside our rcfile by explicitly sourcing
            // /etc/profile first.
            cmd.arg("-i");
        }
        Shell::Other => {
            log::info!(
                "unsupported shell '{}', spawning without integration",
                shell_path
            );
        }
    }
    Ok(cmd)
}

fn integration_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let root = PathBuf::from(home)
        .join(".cache")
        .join("terax")
        .join("shell-integration");
    fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
    Ok(root)
}

fn prepare_zdotdir() -> Result<PathBuf, String> {
    let dir = integration_root()?.join("zsh");
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    write_if_changed(&dir.join(".zshenv"), ZSHENV)?;
    write_if_changed(&dir.join(".zprofile"), ZPROFILE)?;
    write_if_changed(&dir.join(".zshrc"), ZSHRC)?;
    write_if_changed(&dir.join(".zlogin"), ZLOGIN)?;
    Ok(dir)
}

fn prepare_bash_rcfile() -> Result<PathBuf, String> {
    let dir = integration_root()?.join("bash");
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let rc = dir.join("bashrc");
    write_if_changed(&rc, BASHRC)?;
    Ok(rc)
}

fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return Ok(());
        }
    }
    // Atomic replace via tmp + rename so a concurrent shell startup can never
    // source a half-written file. Suffix (not with_extension) because our
    // dotfile basenames have no extension in the Path sense (.zshrc → "").
    let mut tmp: OsString = path.as_os_str().to_owned();
    tmp.push(".__terax_tmp__");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| {
        // Best-effort cleanup of the tmp file on rename failure.
        let _ = fs::remove_file(&tmp);
        format!("rename {} -> {}: {e}", tmp.display(), path.display())
    })
}

// Each zsh startup file delegates to the user's real file at their original
// ZDOTDIR (passed via TERAX_USER_ZDOTDIR; defaults to $HOME).
const ZSHENV: &str = r#"# terax-shell-integration (zshenv)
_terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
[ -f "$_terax_user_zdotdir/.zshenv" ] && source "$_terax_user_zdotdir/.zshenv"
"#;

const ZPROFILE: &str = r#"# terax-shell-integration (zprofile)
_terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
[ -f "$_terax_user_zdotdir/.zprofile" ] && source "$_terax_user_zdotdir/.zprofile"
"#;

const ZLOGIN: &str = r#"# terax-shell-integration (zlogin)
_terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
[ -f "$_terax_user_zdotdir/.zlogin" ] && source "$_terax_user_zdotdir/.zlogin"
"#;

// Zsh integration: OSC 7 + OSC 133 A/B/C/D. `status` is a read-only special
// parameter in zsh, so we shadow $? into `_terax_ret` instead.
const ZSHRC: &str = r#"# terax-shell-integration (zshrc)
_terax_user_zdotdir="${TERAX_USER_ZDOTDIR:-$HOME}"
[ -f "$_terax_user_zdotdir/.zshrc" ] && source "$_terax_user_zdotdir/.zshrc"

if [[ -z "$__TERAX_HOOKS_LOADED" ]]; then
  __TERAX_HOOKS_LOADED=1
  autoload -Uz add-zsh-hook 2>/dev/null

  # URL-encode $PWD byte-wise under LC_ALL=C so multi-byte paths stay valid
  # in the `file://` URI emitted via OSC 7.
  _terax_urlencode() {
    emulate -L zsh
    local LC_ALL=C s="$1" i byte
    for (( i=1; i<=${#s}; i++ )); do
      byte="${s[i]}"
      case "$byte" in
        [a-zA-Z0-9/._~-]) printf '%s' "$byte" ;;
        *) printf '%%%02X' "'$byte" ;;
      esac
    done
  }

  _terax_precmd() {
    local _terax_ret=$?
    printf '\e]133;D;%s\e\\' "$_terax_ret"
    printf '\e]7;file://%s%s\e\\' "${HOST}" "$(_terax_urlencode "$PWD")"
    # Re-inject prompt-end marker in case a framework rebuilt PS1 (p10k, starship).
    if [[ "$PS1" != *$'\e]133;B\e\\'* ]]; then
      PS1=$'%{\e]133;B\e\\%}'"$PS1"
    fi
    printf '\e]133;A\e\\'
  }

  _terax_preexec() {
    printf '\e]133;C\e\\'
  }

  if (( $+functions[add-zsh-hook] )); then
    add-zsh-hook precmd _terax_precmd
    add-zsh-hook preexec _terax_preexec
  fi

  _terax_precmd
fi
"#;

// Bash integration. Key differences vs zsh:
// - We emulate login-shell init manually (`/etc/profile`, profile files) because
//   bash ignores `--rcfile` when started with `-l`.
// - Pre-exec marker uses PS0 (bash 4.4+). On older bash (macOS default 3.2) we
//   skip it — a fragile DEBUG-trap alternative would clobber the user's own
//   traps and interact badly with debuggers.
const BASHRC: &str = r#"# terax-shell-integration (bashrc)
if [ -z "$__TERAX_HOOKS_LOADED" ]; then
  __TERAX_HOOKS_LOADED=1

  # Emulate login-shell init (see note above).
  [ -f /etc/profile ] && source /etc/profile
  [ -f /etc/bashrc ] && source /etc/bashrc
  if [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then
    source "$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile"
  fi
  # .bashrc may have been sourced already by .bash_profile; sourcing again is
  # safe for idempotent rc files (the common case). If yours has side effects
  # on reload, guard with a flag.
  [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"

  _terax_urlencode() {
    local LC_ALL=C s="$1" i c
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9/._~-]) printf '%s' "$c" ;;
        *) printf '%%%02X' "'$c" ;;
      esac
    done
  }

  _terax_precmd() {
    local _terax_ret=$?
    printf '\e]133;D;%s\e\\' "$_terax_ret"
    printf '\e]7;file://%s%s\e\\' "${HOSTNAME:-$(uname -n 2>/dev/null)}" "$(_terax_urlencode "$PWD")"
    if [ -z "$__TERAX_PS1_INJECTED" ]; then
      PS1='\[\e]133;B\e\\\]'"$PS1"
      __TERAX_PS1_INJECTED=1
    fi
    printf '\e]133;A\e\\'
  }

  case ":${PROMPT_COMMAND:-}:" in
    *":_terax_precmd:"*) ;;
    *) PROMPT_COMMAND="_terax_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
  esac

  # Pre-exec marker via PS0 (bash 4.4+). PS0 is expanded just before a command
  # runs — cleaner than a DEBUG trap, which would clobber user traps and fire
  # on every command including inside PROMPT_COMMAND.
  if [ "${BASH_VERSINFO[0]:-0}" -gt 4 ] \
     || { [ "${BASH_VERSINFO[0]:-0}" -eq 4 ] && [ "${BASH_VERSINFO[1]:-0}" -ge 4 ]; }; then
    PS0='\[\e]133;C\e\\\]'"${PS0:-}"
  fi

  _terax_precmd
fi
"#;
