// Renders the parts.json written by tools/render_plot.luau to PNG screenshots.
//
// Usage (from the StadiumTycoon folder):
//   node tools/preview/shoot.js <parts.json> <outDir> [views] [--buttons]
//
//   views     comma separated list of view names, or "all" (default)
//   --buttons draw the buy-button positions (green pads labelled with their item id)
//
// Needs: npm install (in tools/preview) for three.js, and Playwright + Chromium.

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const partsFile = args[0] || "tools/out/parts.json";
const outDir = args[1] || "tools/out";
const viewArg = args[2] || "all";
const showButtons = flags.includes("--buttons");
const noRoofFlag = flags.includes("--noroof");

// Camera views in plot-local studs (-Z = front/plaza, +Z = back).
const VIEWS = {
  aerial: { pos: [-330, 250, -390], target: [0, 0, 10], fov: 45 },
  aerial_back: { pos: [340, 240, 380], target: [0, 0, 0], fov: 45 },
  aerial_far: { pos: [-620, 520, -560], target: [0, 0, 200], fov: 45 },
  top: { ortho: true, half: 225, center: [0, 0] },
  top_full: { ortho: true, half: 420, center: [0, 200] },
  plaza: { pos: [0, 10, -232], target: [0, 14, -100], fov: 70 },
  field: { pos: [0, 7, -30], target: [0, 16, 110], fov: 85 },
  endzone: { pos: [-128, 9, 30], target: [180, 22, 30], fov: 80 },
  crowd: { pos: [0, 30, -20], target: [0, 18, 120], fov: 75 },
  campus: { pos: [-60, 160, 150], target: [-40, 0, 420], fov: 65 },
  hq_top: { ortho: true, half: 190, center: [-75, 280], noroof: true },
  hq_inside: { pos: [-100, 9, 205], target: [-100, 6, 300], fov: 85, noroof: true },
  hq_front: { pos: [-100, 30, 120], target: [-100, 10, 260], fov: 70 },
  fields: { pos: [10, 90, 330], target: [10, 0, 470], fov: 75 },
  hall_garage: { pos: [60, 60, 170], target: [195, 10, 300], fov: 70 },
  fanzone: { pos: [150, 50, -230], target: [244, 5, -20], fov: 70 },
  staff: { pos: [-148, 22, 345], target: [-148, 4, 392], fov: 90 },
  vendors: { pos: [-62, 9, -138], target: [-86, 3, -138], fov: 75 },
};

function render(payload) {
  const { data, view, showButtons, noRoof } = payload;
  const roofPattern = /roof|ceiling|skylight|canopy|clerestory/i;
  const THREE = window.THREE;
  const width = 1400;
  const height = 900;
  document.body.style.margin = "0";
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3ff);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(-250, 400, -180);
  scene.add(sun);

  // surrounding ground so the plot doesn't float
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x4f8f45 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.05;
  scene.add(ground);

  const geometryFor = (part) => {
    const [sx, sy, sz] = part.size;
    if (part.shape === "Cylinder") {
      const g = new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 28);
      g.rotateZ(-Math.PI / 2); // Roblox cylinders run along local X
      return g;
    }
    if (part.shape === "Ball") {
      return new THREE.SphereGeometry(sx / 2, 24, 16);
    }
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (part.shape === "Wedge") {
      // Roblox wedge: tall face at +Z, slope descends toward -Z
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0 && pos.getZ(i) < 0) pos.setY(i, -sy / 2);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
    return g;
  };

  for (const part of data.parts) {
    if (part.transparency >= 0.99) continue;
    if (noRoof && roofPattern.test(part.name)) continue;
    const color = new THREE.Color(part.color[0], part.color[1], part.color[2]);
    const isNeon = part.material === "Neon";
    const material = new THREE.MeshLambertMaterial({
      color,
      emissive: isNeon ? color : new THREE.Color(0, 0, 0),
      emissiveIntensity: isNeon ? 0.6 : 0,
      transparent: part.transparency > 0,
      opacity: 1 - part.transparency,
    });
    const mesh = new THREE.Mesh(geometryFor(part), material);
    const c = part.cf;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.set(c[3], c[4], c[5], c[0], c[6], c[7], c[8], c[1], c[9], c[10], c[11], c[2], 0, 0, 0, 1);
    scene.add(mesh);
  }

  if (showButtons) {
    for (const b of data.buttons) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.6, 6),
        new THREE.MeshLambertMaterial({ color: 0x22ff66, emissive: 0x22ff66, emissiveIntensity: 0.5 })
      );
      pad.position.set(b.x, 0.3, b.z);
      scene.add(pad);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.id, 128, 42);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
      sprite.scale.set(24, 6, 1);
      sprite.position.set(b.x, 10, b.z);
      scene.add(sprite);
    }
  }

  let camera;
  if (view.ortho) {
    const aspect = width / height;
    const h = view.half;
    camera = new THREE.OrthographicCamera(-h * aspect, h * aspect, h, -h, 1, 2000);
    const [cx, cz] = view.center || [0, 0];
    camera.position.set(cx, 600, cz);
    camera.up.set(0, 0, 1); // +Z (back of plot) at the top of the image, plaza at the bottom
    camera.lookAt(cx, 0, cz);
  } else {
    camera = new THREE.PerspectiveCamera(view.fov || 50, width / height, 0.5, 5000);
    camera.position.set(...view.pos);
    camera.lookAt(...view.target);
  }
  renderer.render(scene, camera);
  return true;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(partsFile, "utf8"));
  const names = viewArg === "all" ? Object.keys(VIEWS) : viewArg.split(",");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const threePath = path.join(__dirname, "node_modules", "three", "build", "three.min.js");
  for (const name of names) {
    const view = VIEWS[name];
    if (!view) {
      console.error(`Unknown view '${name}'. Known: ${Object.keys(VIEWS).join(", ")}`);
      continue;
    }
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ path: threePath });
    await page.evaluate(render, { data, view, showButtons, noRoof: noRoofFlag || !!view.noroof });
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    await page.close();
    console.log("wrote", file);
  }
  await browser.close();
})();
