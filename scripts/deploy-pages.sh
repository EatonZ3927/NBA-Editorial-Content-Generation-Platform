#!/usr/bin/env bash
# 一键构建并部署到 GitHub Pages（gh-pages 分支方案）
# 适用于 PAT 无 workflow 权限、无法使用 Actions 自动部署的场景。
# 用法：bash scripts/deploy-pages.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_URL="$(git -C "$REPO_ROOT" remote get-url origin)"
REPO_NAME="$(basename "$REMOTE_URL" .git)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> 1/3 安装依赖并构建静态站点（basePath=/${REPO_NAME}）"
cd "$REPO_ROOT"
PAGES_BASE_PATH="/$REPO_NAME" npm run build

echo "==> 2/3 组装 gh-pages 分支内容"
cp -R out "$TMP_DIR/dist"
touch "$TMP_DIR/dist/.nojekyll"   # 关闭 Jekyll，保证 _next/ 目录可被访问

echo "==> 3/3 强制推送到 gh-pages 分支（单提交、无历史膨胀）"
# 继承主仓库的提交身份（兼容未配置全局 user.name/email 的环境）
export GIT_AUTHOR_NAME="$(git -C "$REPO_ROOT" config user.name || echo pages-deploy)"
export GIT_AUTHOR_EMAIL="$(git -C "$REPO_ROOT" config user.email || echo pages-deploy@localhost)"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

git clone --quiet --no-checkout "$REPO_ROOT" "$TMP_DIR/repo"
cd "$TMP_DIR/repo"
git checkout --quiet --orphan gh-pages-deploy
cp -R "$TMP_DIR/dist"/. .
git add -A
git commit --quiet -m "deploy: GitHub Pages $(date '+%Y-%m-%d %H:%M:%S')"
git push --force "$REMOTE_URL" HEAD:gh-pages

echo ""
echo "✅ 部署完成。若是首次使用，请到仓库 Settings → Pages → Source 选择"
echo "   \"Deploy from a branch\"，Branch 选 gh-pages / (root)，保存后访问："
echo "   https://<你的用户名>.github.io/$REPO_NAME/"
