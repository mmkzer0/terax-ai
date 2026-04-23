use std::path::PathBuf;

// Lists immediate subdirectories of `path`. Expects an absolute path;
// tilde expansion is the caller's responsibility.
//
// Symlinks to directories are included (matches shell `cd` semantics).
// Hidden entries are filtered by dot-prefix only; Windows FILE_ATTRIBUTE_HIDDEN
// is not considered — acceptable for the current macOS/Linux target.
#[tauri::command]
pub fn list_subdirs(path: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&path);
    let read = std::fs::read_dir(&root).map_err(|e| {
        log::debug!("list_subdirs({}) read_dir failed: {e}", root.display());
        e.to_string()
    })?;

    let mut dirs: Vec<String> = read
        .filter_map(Result::ok)
        .filter(|entry| match entry.file_type() {
            Ok(t) if t.is_dir() => true,
            // Resolve symlinks with a single stat — matches shell `cd` semantics.
            Ok(t) if t.is_symlink() => std::fs::metadata(entry.path())
                .map(|m| m.is_dir())
                .unwrap_or(false),
            _ => false,
        })
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| !name.starts_with('.'))
        .collect();

    dirs.sort_by_key(|a| a.to_lowercase());
    Ok(dirs)
}
