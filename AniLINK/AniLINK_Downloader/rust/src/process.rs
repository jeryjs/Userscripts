use anyhow::{anyhow, Result};

#[cfg(windows)]
use winapi::um::processthreadsapi::{OpenProcess, SuspendThread, ResumeThread};
#[cfg(windows)]
use winapi::um::winnt::PROCESS_SUSPEND_RESUME;
#[cfg(windows)]
use winapi::um::tlhelp32::{CreateToolhelp32Snapshot, Thread32First, Thread32Next, THREADENTRY32, TH32CS_SNAPTHREAD};
#[cfg(windows)]
use winapi::um::handleapi::CloseHandle;
#[cfg(windows)]
use std::mem::zeroed;

pub fn pause_process(pid: u32) -> Result<()> {
    #[cfg(windows)]
    {
        unsafe {
            // Take a snapshot of all threads
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot.is_null() {
                return Err(anyhow!("Failed to create thread snapshot"));
            }

            let mut te: THREADENTRY32 = zeroed();
            te.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;

            if Thread32First(snapshot, &mut te) != 0 {
                loop {
                    if te.th32OwnerProcessID == pid {
                        let thread_handle = OpenProcess(PROCESS_SUSPEND_RESUME, 0, te.th32ThreadID);
                        if !thread_handle.is_null() {
                            SuspendThread(thread_handle);
                            CloseHandle(thread_handle);
                        }
                    }
                    if Thread32Next(snapshot, &mut te) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);
        }
    }
    #[cfg(unix)]
    {
        nix::sys::signal::kill(
            nix::unistd::Pid::from_raw(pid as i32),
            nix::sys::signal::Signal::SIGSTOP,
        )?;
    }
    Ok(())
}

pub fn resume_process(pid: u32) -> Result<()> {
    #[cfg(windows)]
    {
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot.is_null() {
                return Err(anyhow!("Failed to create thread snapshot"));
            }

            let mut te: THREADENTRY32 = zeroed();
            te.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;

            if Thread32First(snapshot, &mut te) != 0 {
                loop {
                    if te.th32OwnerProcessID == pid {
                        let thread_handle = OpenProcess(PROCESS_SUSPEND_RESUME, 0, te.th32ThreadID);
                        if !thread_handle.is_null() {
                            ResumeThread(thread_handle);
                            CloseHandle(thread_handle);
                        }
                    }
                    if Thread32Next(snapshot, &mut te) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);
        }
    }
    #[cfg(unix)]
    {
        nix::sys::signal::kill(
            nix::unistd::Pid::from_raw(pid as i32),
            nix::sys::signal::Signal::SIGCONT,
        )?;
    }
    Ok(())
}

pub fn kill_process(pid: u32) -> Result<()> {
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new("taskkill")
            .args(&["/PID", &pid.to_string(), "/T", "/F"])
            .output()?;
    }
    #[cfg(unix)]
    {
        nix::sys::signal::kill(
            nix::unistd::Pid::from_raw(pid as i32),
            nix::sys::signal::Signal::SIGTERM,
        )?;
    }
    Ok(())
}
