#!/bin/sh
# 重编 Mac 日历助手（工作台日历.app）。只有改了 src/ 才需要，而且只在做模板的电脑上编，不在老板的电脑上编：
#   - 模板里带的 工作台日历.app 是编好的成品（arm64 + x86_64 通用），老板的电脑不用装 Xcode；
#   - ad-hoc 签名的指纹就是 Mac 记“允许读日历”的身份，重编一次指纹就变，每台电脑都得重新点一次“允许”。
# 用法：sh tools/mac-calendar/build.sh [输出目录]   需要 Xcode 命令行工具（swiftc、lipo）；codesign 系统自带
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-"$HERE"}
APP="$OUT/工作台日历.app"
TMP=$(mktemp -d)
for arch in arm64 x86_64; do
  swiftc -O -parse-as-library -target "$arch-apple-macos13.0" \
    -framework EventKit -framework AppKit "$HERE/src/CalendarHelper.swift" -o "$TMP/helper-$arch"
done
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
lipo -create "$TMP/helper-arm64" "$TMP/helper-x86_64" -output "$APP/Contents/MacOS/calendar-helper"
cp "$HERE/src/Info.plist" "$APP/Contents/Info.plist"
# ad-hoc 签名：Mac 记的是 bundle id + 签名要求（ad-hoc 时就是指纹 cdhash）
codesign --force --sign - --identifier com.boss-workbench.calendar "$APP"
codesign --verify --strict "$APP"
rm -rf "$TMP"
echo "$APP"
