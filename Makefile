.PHONY: dev build clean

dev:
	wails dev -tags native_webview2loader

build:
	wails build -tags native_webview2loader

clean:
	wails clean
