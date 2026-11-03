set -e
cd /workspace/work/vela
NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit -p .
NODE_OPTIONS=--max-old-space-size=4096 VITE_E2E=1 npm run build >/dev/null 2>&1
rm -rf /workspace/work/ve/Vela && cp -r docs /workspace/work/ve/Vela
LD_LIBRARY_PATH=/workspace/work/browser-test/libs/root/usr/lib/aarch64-linux-gnu node tests/hero2-shots.mjs
