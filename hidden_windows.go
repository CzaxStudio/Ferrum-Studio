//go:build windows

package main

import "syscall"

// hiddenWindow returns a SysProcAttr that hides the console window
// when running reg.exe or other Windows tools from within the app.
func hiddenWindow() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true}
}
