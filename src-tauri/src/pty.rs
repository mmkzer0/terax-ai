use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;

const FLUSH_INTERVAL: Duration = Duration::from_millis(8);
const READ_BUF: usize = 16 * 1024;

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PtyEvent {
    /// Base64-encoded PTY output bytes (coalesced).
    Data { data: String },
    /// Shell exited.
    Exit { code: i32 },
}

pub struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: RwLock<HashMap<u32, Arc<Session>>>,
    next_id: Mutex<u32>,
}

#[tauri::command]
pub fn pty_open(
    state: tauri::State<PtyState>,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    if let Ok(cwd) = std::env::current_dir() {
        cmd.cwd(cwd);
    }

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = {
        let mut n = state.next_id.lock().unwrap();
        *n += 1;
        *n
    };

    let session = Arc::new(Session {
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        killer: Mutex::new(killer),
    });
    state.sessions.write().unwrap().insert(id, session);

    // Coalescing buffer: reader thread appends, flush thread drains every FLUSH_INTERVAL.
    let pending: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::with_capacity(READ_BUF)));

    // Reader thread: blocking reads → append to pending buffer.
    let pending_r = pending.clone();
    thread::spawn(move || {
        let mut buf = [0u8; READ_BUF];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => pending_r.lock().unwrap().extend_from_slice(&buf[..n]),
                Err(_) => break,
            }
        }
    });

    // Flush thread: drains pending, sends one Data event per tick.
    let on_event_flush = on_event.clone();
    let pending_f = pending.clone();
    thread::spawn(move || loop {
        thread::sleep(FLUSH_INTERVAL);
        let chunk = {
            let mut g = pending_f.lock().unwrap();
            if g.is_empty() {
                continue;
            }
            std::mem::take(&mut *g)
        };
        let event = PtyEvent::Data { data: B64.encode(&chunk) };
        if on_event_flush.send(event).is_err() {
            break;
        }
    });

    // Wait thread: emits Exit event when shell terminates.
    let on_event_exit = on_event;
    thread::spawn(move || {
        let code = match child.wait() {
            Ok(status) => status.exit_code() as i32,
            Err(_) => -1,
        };
        // Give the flush thread one more tick to drain final output before exit notification.
        thread::sleep(FLUSH_INTERVAL * 2);
        let _ = on_event_exit.send(PtyEvent::Exit { code });
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(
    state: tauri::State<PtyState>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let session = {
        let map = state.sessions.read().unwrap();
        map.get(&id).cloned().ok_or("no session")?
    };
    let result = session
        .writer
        .lock()
        .unwrap()
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = {
        let map = state.sessions.read().unwrap();
        map.get(&id).cloned().ok_or("no session")?
    };
    let result = session
        .master
        .lock()
        .unwrap()
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn pty_close(state: tauri::State<PtyState>, id: u32) -> Result<(), String> {
    let session = state.sessions.write().unwrap().remove(&id);
    if let Some(s) = session {
        let _ = s.killer.lock().unwrap().kill();
    }
    Ok(())
}
