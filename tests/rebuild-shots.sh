set -e
cd /workspace/work/vela
npm run build > /tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 1; }
tail -3 /tmp/build.log
rm -rf /workspace/work/vsite/Vela && cp -r docs /workspace/work/vsite/Vela
VITE_E2E=1 npx vite build --outDir /tmp/vela-e2e-out --emptyOutDir > /tmp/build-e2e.log 2>&1 || { tail -20 /tmp/build-e2e.log; exit 1; }
rm -rf /workspace/work/vsite-e2e/Vela && cp -r /tmp/vela-e2e-out /workspace/work/vsite-e2e/Vela
echo rebuilt
