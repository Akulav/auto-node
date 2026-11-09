#!/usr/bin/env bash
# AutoNode installer — made by Akulav
#   curl -fsSL https://raw.githubusercontent.com/Akulav/auto-node/main/install.sh | sudo bash
set -euo pipefail

REPO="${AUTONODE_REPO:-https://github.com/Akulav/auto-node.git}"
BRANCH="${AUTONODE_BRANCH:-main}"
DIR="${AUTONODE_DIR:-/opt/autonode}"
NODE_MAJOR="${AUTONODE_NODE_MAJOR:-22}"

blue() { printf '\033[34m›\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || fail "AutoNode runs on Linux."
[ "$(id -u)" -eq 0 ] || fail "Please run as root: curl -fsSL … | sudo bash"
command -v systemctl >/dev/null || fail "AutoNode needs systemd."

if command -v apt-get >/dev/null; then PM=apt
elif command -v dnf >/dev/null; then PM=dnf
elif command -v pacman >/dev/null; then PM=pacman
else PM=none; fi

pkg_install() {
  case "$PM" in
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null ;;
    dnf) dnf install -y -q "$@" >/dev/null ;;
    pacman) pacman -Sy --noconfirm --needed "$@" >/dev/null ;;
    *) fail "Please install: $*" ;;
  esac
}

blue "Installing tools (git, unzip, openssl, curl)"
[ "$PM" = apt ] && apt-get update -qq >/dev/null
pkg_install git unzip openssl curl ca-certificates

need_node=1
if command -v node >/dev/null; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" = 1 ]; then
  blue "Installing Node.js $NODE_MAJOR"
  case "$PM" in
    apt) curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null && pkg_install nodejs ;;
    dnf) curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null && pkg_install nodejs ;;
    pacman) pkg_install nodejs npm ;;
    *) fail "Please install Node.js 18 or newer first." ;;
  esac
fi

if [ -d "$DIR/.git" ]; then
  blue "Updating AutoNode in $DIR"
  git -C "$DIR" config core.fileMode false
  git -C "$DIR" pull --ff-only -q
else
  blue "Downloading AutoNode to $DIR"
  git clone -q --depth 50 -b "$BRANCH" "$REPO" "$DIR"
fi
# chmod +x below must not look like a local edit to the self-updater.
git -C "$DIR" config core.fileMode false

chmod +x "$DIR/bin/autonode.js"
node "$DIR/bin/autonode.js" install
