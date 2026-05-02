//go:build !windows

package main

import "syscall"

// hiddenWindow is a no-op on non-Windows platforms.
func hiddenWindow() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}
