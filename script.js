// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f172a');

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4, 4, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// Cube Geometry
const cubeSize = 2;
const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const edgesGeometry = new THREE.EdgesGeometry(geometry);
const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
const cubeEdges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
scene.add(cubeEdges);

// Transparent Cube for volume feeling
const cubeMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.1,
    depthWrite: false
});
const cubeMesh = new THREE.Mesh(geometry, cubeMaterial);
scene.add(cubeMesh);

// Interaction Points (Vertices + Edge Midpoints)
const interactionPoints = [];
const pointGroup = new THREE.Group();
scene.add(pointGroup);

const pointsData = [];

// Helper to add point
function addPoint(x, y, z, type) {
    const pointGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const pointMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    const mesh = new THREE.Mesh(pointGeo, pointMat);
    mesh.position.set(x, y, z);
    mesh.userData = { isPoint: true, id: pointsData.length, type: type };
    pointGroup.add(mesh);
    pointsData.push({ mesh, selected: false, position: new THREE.Vector3(x, y, z) });
    interactionPoints.push(mesh);
}

// Add Vertices
const v = cubeSize / 2;
const signs = [-1, 1];
signs.forEach(x => {
    signs.forEach(y => {
        signs.forEach(z => {
            addPoint(x * v, y * v, z * v, 'vertex');
        });
    });
});

// Add Edge Midpoints
// Edges are where two coordinates are constant (at +/- v) and one varies (0)
// Actually midpoints are where one coord is 0 and two are +/- v
// x-axis edges: y=±v, z=±v, x=0
signs.forEach(y => {
    signs.forEach(z => {
        addPoint(0, y * v, z * v, 'edge-mid');
    });
});
// y-axis edges: x=±v, z=±v, y=0
signs.forEach(x => {
    signs.forEach(z => {
        addPoint(x * v, 0, z * v, 'edge-mid');
    });
});
// z-axis edges: x=±v, y=±v, z=0
signs.forEach(x => {
    signs.forEach(y => {
        addPoint(x * v, y * v, 0, 'edge-mid');
    });
});

// Selection Logic
let selectedPoints = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Cross Section Mesh
let sectionMesh = null;
let sectionEdges = null;

function updateSelection() {
    pointsData.forEach(p => {
        if (p.selected) {
            p.mesh.material.color.setHex(0xf43f5e); // Red/Pink for selected
            p.mesh.scale.set(1.2, 1.2, 1.2);
        } else {
            p.mesh.material.color.setHex(0x94a3b8); // Gray for unselected
            p.mesh.scale.set(1, 1, 1);
        }
    });

    document.getElementById('status').innerText = `선택된 점: ${selectedPoints.length} / 3`;

    if (selectedPoints.length === 3) {
        calculateCrossSection();
    } else {
        removeCrossSection();
    }
}

function removeCrossSection() {
    if (sectionMesh) {
        scene.remove(sectionMesh);
        sectionMesh.geometry.dispose();
        sectionMesh = null;
    }
    if (sectionEdges) {
        scene.remove(sectionEdges);
        sectionEdges.geometry.dispose();
        sectionEdges = null;
    }
    document.getElementById('polygon-type').innerText = '';
}

function calculateCrossSection() {
    removeCrossSection();

    const p1 = selectedPoints[0].position;
    const p2 = selectedPoints[1].position;
    const p3 = selectedPoints[2].position;

    // Define Plane
    const plane = new THREE.Plane();
    plane.setFromCoplanarPoints(p1, p2, p3);

    // Find intersections with cube edges
    const intersectionPoints = [];

    // Define cube edges (pairs of vertices)
    // We can iterate all 12 edges.
    // Vertices are at (+/- v, +/- v, +/- v)
    // Let's define the 8 vertices
    const vertices = [];
    for (let x of [-v, v]) {
        for (let y of [-v, v]) {
            for (let z of [-v, v]) {
                vertices.push(new THREE.Vector3(x, y, z));
            }
        }
    }

    // Edges connect vertices that differ by exactly one coordinate
    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const d = vertices[i].distanceTo(vertices[j]);
            // distance should be exactly cubeSize (2*v)
            if (Math.abs(d - cubeSize) < 0.001) {
                edges.push([vertices[i], vertices[j]]);
            }
        }
    }

    const target = new THREE.Vector3();
    edges.forEach(edge => {
        const line = new THREE.Line3(edge[0], edge[1]);
        if (plane.intersectLine(line, target)) {
            // Check if point is already added (avoid duplicates)
            const exists = intersectionPoints.some(p => p.distanceTo(target) < 0.001);
            if (!exists) {
                intersectionPoints.push(target.clone());
            }
        }
    });

    if (intersectionPoints.length < 3) return;



    // Sort points to form a polygon
    // Calculate centroid
    const centroid = new THREE.Vector3();
    intersectionPoints.forEach(p => centroid.add(p));
    centroid.divideScalar(intersectionPoints.length);

    // Calculate normal of the plane (we have it)
    const normal = plane.normal;

    // Define a basis on the plane to calculate angles
    // u = (p0 - centroid) normalized
    const u = new THREE.Vector3().subVectors(intersectionPoints[0], centroid).normalize();
    // v = normal cross u
    const vVec = new THREE.Vector3().crossVectors(normal, u).normalize();

    intersectionPoints.sort((a, b) => {
        const vecA = new THREE.Vector3().subVectors(a, centroid);
        const vecB = new THREE.Vector3().subVectors(b, centroid);

        const angleA = Math.atan2(vecA.dot(vVec), vecA.dot(u));
        const angleB = Math.atan2(vecB.dot(vVec), vecB.dot(u));

        return angleA - angleB;
    });

    // Detailed Polygon Classification
    const len = intersectionPoints.length;
    let typeText = '';

    // Calculate side lengths and vectors
    const sides = [];
    const sideVectors = [];
    for (let i = 0; i < len; i++) {
        const p1 = intersectionPoints[i];
        const p2 = intersectionPoints[(i + 1) % len];
        const vec = new THREE.Vector3().subVectors(p2, p1);
        sideVectors.push(vec);
        sides.push(vec.length());
    }

    // Calculate internal angles
    const angles = [];
    for (let i = 0; i < len; i++) {
        const pPrev = intersectionPoints[(i - 1 + len) % len];
        const pCurr = intersectionPoints[i];
        const pNext = intersectionPoints[(i + 1) % len];

        const v1 = new THREE.Vector3().subVectors(pPrev, pCurr).normalize();
        const v2 = new THREE.Vector3().subVectors(pNext, pCurr).normalize();
        angles.push(v1.angleTo(v2));
    }

    const allSidesEqual = sides.every(s => Math.abs(s - sides[0]) < 0.001);
    const allAnglesEqual = angles.every(a => Math.abs(a - angles[0]) < 0.001);
    const isRegular = allSidesEqual && allAnglesEqual;

    if (len === 3) {
        if (isRegular) typeText = '정삼각형';
        else {
            const isIso = Math.abs(sides[0] - sides[1]) < 0.001 || Math.abs(sides[1] - sides[2]) < 0.001 || Math.abs(sides[2] - sides[0]) < 0.001;
            const isRight = angles.some(a => Math.abs(a - Math.PI / 2) < 0.001);

            if (isRight && isIso) typeText = '직각이등변삼각형';
            else if (isRight) typeText = '직각삼각형';
            else if (isIso) typeText = '이등변삼각형';
            else typeText = '삼각형';
        }
    } else if (len === 4) {
        if (isRegular) {
            typeText = '정사각형';
        } else {
            // Check Parallelism
            const v0 = sideVectors[0].clone().normalize();
            const v1 = sideVectors[1].clone().normalize();
            const v2 = sideVectors[2].clone().normalize();
            const v3 = sideVectors[3].clone().normalize();

            // Cross product length < epsilon implies parallel
            const p0_2 = new THREE.Vector3().crossVectors(v0, v2).length() < 0.01;
            const p1_3 = new THREE.Vector3().crossVectors(v1, v3).length() < 0.01;

            if (p0_2 && p1_3) {
                if (allSidesEqual) typeText = '마름모';
                else if (allAnglesEqual) typeText = '직사각형';
                else typeText = '평행사변형';
            } else if (p0_2 || p1_3) {
                // Trapezoid
                let isIsoTrap = false;
                if (p0_2) { // 0 and 2 parallel, check 1 and 3
                    if (Math.abs(sides[1] - sides[3]) < 0.001) isIsoTrap = true;
                } else { // 1 and 3 parallel, check 0 and 2
                    if (Math.abs(sides[0] - sides[2]) < 0.001) isIsoTrap = true;
                }
                typeText = isIsoTrap ? '등변사다리꼴' : '사다리꼴';
            } else {
                typeText = '사각형';
            }
        }
    } else {
        typeText = (isRegular ? '정' : '') + len + '각형';
    }

    document.getElementById('polygon-type').innerText = `단면 모양: ${typeText}`;

    // Create Geometry
    const shape = new THREE.Shape();
    // We need to project 3D points to 2D shape plane to use ShapeGeometry, 
    // OR we can just use BufferGeometry and make a fan/strip.
    // Easiest for filled polygon in 3D is to create a fan of triangles from centroid,
    // or just use the ordered points to make a BufferGeometry with an index.

    // Let's use BufferGeometry with a simple triangulation (fan from first point or centroid)
    // Since it's convex, a fan from the first point works, or centroid.

    const geometry = new THREE.BufferGeometry().setFromPoints(intersectionPoints);
    // Create indices for triangles: 0, 1, 2; 0, 2, 3; ...
    const indices = [];
    for (let i = 1; i < intersectionPoints.length - 1; i++) {
        indices.push(0, i, i + 1);
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
    });

    sectionMesh = new THREE.Mesh(geometry, material);
    scene.add(sectionMesh);

    // Add outline to section
    const outlineGeo = new THREE.BufferGeometry().setFromPoints([...intersectionPoints, intersectionPoints[0]]);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    sectionEdges = new THREE.Line(outlineGeo, outlineMat);
    scene.add(sectionEdges);
}

// Event Listeners
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const canvas = document.getElementById('canvas-container');

let isDragging = false;
let startX = 0;
let startY = 0;

canvas.addEventListener('pointerdown', (event) => {
    isDragging = false;
    startX = event.clientX;
    startY = event.clientY;
});

canvas.addEventListener('pointermove', (event) => {
    if (Math.abs(event.clientX - startX) > 5 || Math.abs(event.clientY - startY) > 5) {
        isDragging = true;
    }

    // Hover effect logic
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactionPoints);

    // Reset all non-selected to default scale
    pointsData.forEach(p => {
        if (!p.selected) {
            p.mesh.scale.set(1, 1, 1);
            p.mesh.material.color.setHex(0x94a3b8);
        }
    });

    if (intersects.length > 0) {
        const object = intersects[0].object;
        const data = pointsData[object.userData.id];
        if (!data.selected) {
            object.scale.set(1.5, 1.5, 1.5);
            object.material.color.setHex(0x38bdf8); // Blue highlight
        }
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }
});

canvas.addEventListener('pointerup', (event) => {
    if (isDragging) return;

    // Calculate mouse position
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(interactionPoints);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        const data = pointsData[object.userData.id];

        if (data.selected) {
            // Deselect
            data.selected = false;
            selectedPoints = selectedPoints.filter(p => p !== data);
        } else {
            // Select
            if (selectedPoints.length < 3) {
                data.selected = true;
                selectedPoints.push(data);
            }
        }
        updateSelection();
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    selectedPoints.forEach(p => p.selected = false);
    selectedPoints = [];
    updateSelection();
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
