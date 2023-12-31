import { Renderer } from "./renderer.js";
const canvas = document.getElementById("viewport");
const gl = canvas.getContext("webgl2");
const renderer = new Renderer(gl);
renderer.backgroundColor = [0.3, 0.3, 0.3];
const renderModeSelect = document.getElementById('render-mode');
renderer.renderMode = Number.parseInt(renderModeSelect.value);
renderModeSelect.addEventListener('change', e => {
    const renderMode = Number.parseInt(renderModeSelect.value);
    renderer.renderMode = renderMode;
});
const epsilonInput = document.getElementById('epsilon');
const epsilonLabel = document.getElementById('epsilon-label');
renderer.epsilon = Number.parseFloat(epsilonInput.value);
epsilonLabel.innerText = `ε=${epsilonInput.value}`;
epsilonInput.addEventListener('input', e => {
    renderer.epsilon = Number.parseFloat(epsilonInput.value);
    epsilonLabel.innerText = `ε=${epsilonInput.value}`;
});
canvas.addEventListener("mousedown", e => {
    renderer.mousePressed(true);
});
canvas.addEventListener("mouseup", e => {
    renderer.mousePressed(false);
});
canvas.addEventListener("mouseenter", e => {
    renderer.mouseInViewport(true);
});
canvas.addEventListener("mouseleave", e => {
    renderer.mouseInViewport(false);
});
canvas.addEventListener("mousemove", e => {
    renderer.sendMousePos(e.offsetX, e.offsetY);
});
const lastFrame = performance.now();
requestAnimationFrame(loop);
function loop() {
    const dt = (performance.now() - lastFrame) / 1000;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.clearColor(renderer.backgroundColor[0], renderer.backgroundColor[1], renderer.backgroundColor[2], 255);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
    renderer.render(dt);
    requestAnimationFrame(loop);
}
