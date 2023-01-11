import {VertexAttributes} from './vertex-attributes';
import {ShaderProgram} from './shader-program';
import {VertexArray} from './vertex-array';
import {Matrix4} from './matrix';
import {Vector3, Vector4} from './vector';
import { Trimesh } from './trimesh';
import {Terrain} from './terrain';
import {Camera, TerrainCamera} from './camera';

let collectCount = 0;
let canvas;
let attributes;
let shaderProgram;
let vao;
let clipFromEye;
let terrainTrimesh;
let terrain;
let terrainCamera;
let lightCamera;
let forward = 0;
let strafe = 0;
let rotationSpeed = 0.5;
let movementSpeed = 0.5;
let imageWidth;
let imageDepth;
let depthTexture;
let depthFbo;
let depthProgram;
let moveBackDawg = 10;
let rotater, degrees;

let T, positionsTri, normalsTri, indicesTri, min_max;
let boxVaos = [];
const terrainObjectsSize = 25;
const numOfTerrainObjects = 50;

let collectT, collectPositionsTri, collectNormalsTri, collectIndicesTri, collectMinMax;
let collectVaos = [];
const collectObjectsSize = 5;
const numOfCollectObjects = 25;
let collectbilesPositions = [];
let collectAudio;

async function readImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

function createTexture2d(image, textureUnit) {
  gl.activeTexture(textureUnit);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

async function createTrimeshFrommObject(file) {
  const text = await fetch(file).then(response => response.text());
  return Trimesh.fromObj(text);
}

async function readObjectFromFile(file) {
  const object = await fetch(file).then(response => response.json());
  return object;
}

function render() {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  shaderProgram.bind();

  shaderProgram.setUniformMatrix4('clipFromEye', clipFromEye);
  shaderProgram.setUniformMatrix4('eyeFromWorld', terrainCamera.eyeFromWorld);
  shaderProgram.setUniformMatrix4('worldFromModel', Matrix4.identity());
  //let lightVector = lightCamera.getPosition().normalize();
  //shaderProgram.setUniform3f('lightDirection', lightVector.getX(), lightVector.getY(), lightVector.getZ());

  shaderProgram.setUniform1i('moonTexture', 0);
  
  vao.bind();
  vao.drawIndexed(gl.TRIANGLES);
  vao.unbind();

  shaderProgram.setUniform1i('moonTexture', 2);

  for(let i = 0; i < boxVaos.length; i++) {
    boxVaos[i].bind();
    boxVaos[i].drawIndexed(gl.TRIANGLES);
    boxVaos[i].unbind();
  }

  shaderProgram.setUniform1i('moonTexture', 1);

  for(let i = 0; i < collectVaos.length; i++) {
    collectVaos[i].bind();
    collectVaos[i].drawIndexed(gl.TRIANGLES);
    collectVaos[i].unbind();
  }

  shaderProgram.unbind();
}

function onResizeWindow() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  clipFromEye = Matrix4.fovPerspective(45, canvas.width / canvas.height, 0.1, 1000);
  render();
}

async function initialize() {
  canvas = document.getElementById('canvas');
  window.gl = canvas.getContext('webgl2');

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  rotater = Matrix4.identity();

  let lightPosition = Vector3.fromValues(0, 5, 0);
  let lightTarget = Vector3.fromValues(5, 5, 0);

  lightCamera = new Camera(lightPosition, lightTarget, Vector3.fromValues(0, 1, 0));
  const lightFromWorld = lightCamera.matrix;
  const clipFromLight = Matrix4.fovPerspective(45, 1, 0.1, 1000);

  const heightImage = await readImage('heightmap3.png');
  terrain = new Terrain(imageToGrayscale(heightImage), imageWidth, imageDepth);
  terrainTrimesh = terrain.toTrimesh();

  const positions = terrainTrimesh.getFlatPositions();

  const texPositions = [];

  for(let i = 0; i < positions.length; i += 3) {
    texPositions.push(((positions[i] - 0) * (1 - 0)) / ((terrain.getWidth() - 0) + 0));
    texPositions.push(((positions[i + 2] - 0) * (1 - 0)) / ((terrain.getDepth() - 0) + 0));
  }

  const normals = terrainTrimesh.getFlatNormals();

  const indices = terrainTrimesh.getIndicies();

  depthTexture = reserveDepthTexture(25, 25);
  depthFbo = initializeDepthFbo(depthTexture);

  const moonImage = await readImage('moon_texture.png');
  createTexture2d(moonImage, gl.TEXTURE0);

  const gemImage = await readImage('gem_texture2.jpeg');
  createTexture2d(gemImage, gl.TEXTURE1);

  const alienImage = await readImage('green_texture.jpeg');
  createTexture2d(alienImage, gl.TEXTURE2);


  T = createTrimeshFrommObject("alien.obj");
  positionsTri = (await T).getFlatPositions();
  normalsTri = (await T).getFlatNormals();
  indicesTri = (await T).getIndicies();

  let boxAttributes = [];
  for(let i = 0; i < numOfTerrainObjects; i++) {
    boxAttributes[i] = generateObject(0);
  }

  collectT = createTrimeshFrommObject("gem.obj");
  collectPositionsTri = (await collectT).getFlatPositions();
  collectNormalsTri = (await collectT).getFlatNormals();
  collectIndicesTri = (await collectT).getIndicies();
  collectAudio = new Audio('gem_grab.mp3');

  let collectAttributes = [];
  for(let i = 0; i < numOfCollectObjects; i++) {
    collectAttributes[i] = generateObject(1);
  }

  attributes = new VertexAttributes();
  attributes.addAttribute('position', positions.length / 3, 3, positions);
  attributes.addAttribute('normal', normals.length / 3, 3, normals);
  attributes.addAttribute('texPosition', texPositions.length/2, 2, texPositions);
  attributes.addIndices(indices);

  const vertexSource = `
  uniform mat4 clipFromEye;
  uniform mat4 eyeFromWorld;
  uniform mat4 worldFromModel;
  
  in vec3 position;
  in vec2 texPosition;
  in vec3 normal;
  
  out vec3 mixNormal;
  out vec2 mixTexPosition;
  
  void main() {
    gl_PointSize = 3.0;
    gl_Position = clipFromEye * eyeFromWorld * worldFromModel * vec4(position, 1.0);
    mixNormal = (eyeFromWorld * worldFromModel * vec4(normal, 0.0)).xyz;
    mixTexPosition = texPosition;
  }
    `;
  
    const fragmentSource = `
  uniform sampler2D moonTexture;
  
  const float ambientFactor = 0.5;
  const vec3 lightDirection = normalize(vec3(0.0, 1.0, 0.0));
  const vec3 albedo = vec3(0.8, 0.8, 0.8);
  
  in vec3 mixNormal;
  in vec2 mixTexPosition;
  
  out vec4 fragmentColor;
  
  void main() {
    fragmentColor = texture(moonTexture, mixTexPosition);
  }
    `;

  terrainCamera = new TerrainCamera(Vector3.fromValues((imageWidth / 2), 0, (imageDepth / 2)), Vector3.fromValues(0, 0, -1), Vector3.fromValues(0, 1, 0), terrain, 10);

  terrainCamera.bouy();

  shaderProgram = new ShaderProgram(vertexSource, fragmentSource);


  vao = new VertexArray(shaderProgram, attributes);

  for(let i = 0; i < boxAttributes.length; i++){
    boxVaos[i] = new VertexArray(shaderProgram, boxAttributes[i]);
  }
  for(let i = 0; i < collectAttributes.length; i++){
    collectVaos[i] = new VertexArray(shaderProgram, collectAttributes[i]);
  }
  

  window.addEventListener('resize', onResizeWindow);
  onResizeWindow();

  window.addEventListener('resize', onResizeWindow);
  window.addEventListener('pointerdown', () => {
    document.body.requestPointerLock();
  });
  
  window.addEventListener('pointermove', event => {

    if (document.pointerLockElement) {
      terrainCamera.yaw(-event.movementX * rotationSpeed);
      terrainCamera.pitch(-event.movementY * rotationSpeed);
      render();
    }
  });

  window.addEventListener('keydown', event => {
    if(event.key == 'w') {
      forward = 2;
    } else if(event.key === 'a') {
      strafe = -2;
    } else if(event.key === 's') {
      forward = -2;
    } else if(event.key === 'd') {
      strafe = 2;
    }
  });

  window.addEventListener('keyup', event => {
    if(event.key === 'w' || event.key === 's') {
      forward = 0;
    } else if(event.key === 'a' || event.key === 'd') {
      strafe = 0;
    }
  });

  move();
  onResizeWindow();
}

function checkCollision() {
  for(let i = 0; i < collectbilesPositions.length; i++) {
    let boundingBox = computeBoundingBox(Vector4.flatToVectors(collectbilesPositions[i]));

    if((terrainCamera.getPosition().getX() >= boundingBox[0] && terrainCamera.getPosition().getX() <= boundingBox[3]) &&
        (terrainCamera.getPosition().getZ() >= boundingBox[2] && terrainCamera.getPosition().getZ() <= boundingBox[5]))
    {
      collectAudio.play();
      collectbilesPositions.splice(i, 1);
      collectVaos.splice(i, 1);
      break;
    } 
  }
}

function move() {
  
  if (forward != 0) {
    terrainCamera.advance(movementSpeed * forward);
    render();
  } 
  if (strafe != 0) {
    terrainCamera.strafe(movementSpeed * strafe);
    render();
  }

  checkCollision();
  requestAnimationFrame(move);
};

function generateObject(isCollectible) {
  let positions = [];
  let texPositions = [];
  let normals = [];
  let indices = [];
  let min_max;
  let positionsArrayLength = (isCollectible) ? collectPositionsTri.length : positionsTri.length;
  let boxAttributes = new VertexAttributes();

  /* Creation of Trimesh object from .obj file.
  *  Variables representing attributes are pulled from that object.
  */
    let randx = (Math.random() * terrain.width);
    let randz = (Math.random() * terrain.width);
    let height_variance = (Math.random() * 10 + 2);

    let tempPos = [];
    
    for (let i = 0; i < positionsArrayLength; i += 3) {
      
      if(isCollectible) {
        tempPos.push((collectPositionsTri[i] * collectObjectsSize) + randx);
        tempPos.push((collectPositionsTri[i + 1] * collectObjectsSize) + terrain.get(randx, randz) + height_variance);
        tempPos.push((collectPositionsTri[i + 2] * collectObjectsSize) + randz);
      }
      else {
        tempPos.push((positionsTri[i] * terrainObjectsSize) + randx);
        tempPos.push((positionsTri[i + 1] * terrainObjectsSize) + terrain.get(randx, randz));
        tempPos.push((positionsTri[i + 2] * terrainObjectsSize) + randz);
      }
    }

    if(isCollectible) {
      positions.push(...tempPos);
      normals.push(...collectNormalsTri);
      indices.push(...collectIndicesTri);

      min_max = computeBoundingBox(Vector4.flatToVectors(positions));

      for(let i = 0; i < positions.length; i += 3) {
        texPositions.push(((positions[i] - min_max[0]) * (0.4 - 0.2)) / ((min_max[3] - min_max[0]) + 0));
        texPositions.push(((positions[i + 2] - min_max[0]) * (0.4 - 0.2)) / ((min_max[3] - min_max[0]) + 0));
      }

      collectbilesPositions.push(positions);

      boxAttributes.addAttribute('position', positions.length / 3, 3, collectbilesPositions[collectCount]);
      boxAttributes.addAttribute('normal', normals.length / 3, 3, normals);
      boxAttributes.addAttribute('texPosition', texPositions.length/2, 2, texPositions);
      boxAttributes.addIndices(indices);
      collectCount++;
    }
    else {
      positions.push(...tempPos);
      normals.push(...normalsTri);
      indices.push(...indicesTri);

      min_max = computeBoundingBox(Vector4.flatToVectors(positions));

      for(let i = 0; i < positions.length; i += 3) {
        texPositions.push(((positions[i] - min_max[0]) * (0.2 - 0)) / ((min_max[3] - min_max[0]) + 0));
        texPositions.push(((positions[i + 2] - min_max[0]) * (0.2 - 0)) / ((min_max[3] - min_max[0]) + 0));
      }

      boxAttributes.addAttribute('position', positions.length / 3, 3, positions);
      boxAttributes.addAttribute('normal', normals.length / 3, 3, normals);
      boxAttributes.addAttribute('texPosition', texPositions.length/2, 2, texPositions);
      boxAttributes.addIndices(indices);
    }

  return boxAttributes;
}

function imageToGrayscale(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  imageWidth = image.width;
  imageDepth = image.height;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, image.width, image.height);
  const pixels = context.getImageData(0, 0, image.width, image.height);

  const grays = new Array(image.width * image.height);
  for (let i = 0; i < image.width * image.height; ++i) {
    grays[i] = (pixels.data[i * 4] * 0.25);
  }

  return grays;
}

window.addEventListener('load', initialize());


function reserveDepthTexture(width, height, unit = gl.TEXTURE0) {
  gl.activeTexture(unit);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, width, height, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function initializeDepthFbo(depthTexture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return framebuffer;
}

function renderDepths(width, height, fbo) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  gl.viewport(0, 0, width, height);
  gl.clear(gl.DEPTH_BUFFER_BIT);

  const clipFromWorld = clipFromLight.multiplyMatrix(lightFromWorld);

  depthProgram.bind();
  // for each object
  //   clipFromModel = clipFromWorld * object's worldFromModel
  //   set clipFromModel uniform
  //   draw object
  depthProgram.unbind();

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initializeDepthProgram() {
  const vertexSource = `
uniform mat4 clipFromWorld;
uniform mat4 worldFromModel;
in vec3 position;

void main() {
  gl_Position = clipFromWorld * worldFromModel * vec4(position, 1.0);
}
  `;

  const fragmentSource = `
out vec4 fragmentColor;

void main() {
  fragmentColor = vec4(1.0);
}
    `;

  depthProgram = new ShaderProgram(vertexSource, fragmentSource);
}

function computeBoundingBox(positions) {
  let max = Vector3.fromValues(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);
  let min = Vector3.fromValues(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  

  for (let i = 0; i < positions.length; i++) {
    let current_position = positions[i];

    if (current_position.getX() < min.getX()) {
        min.setX(current_position.getX());
    } else if (current_position.getX() > max.getX()) {
        max.setX(current_position.getX());
    }

    if (current_position.getY() < min.getY()) {
        min.setY(current_position.getY());
    } else if (current_position.getY() > max.getY()) {
        max.setY(current_position.getY());
    }

    if (current_position.getZ() < min.getZ()) {
        min.setZ(current_position.getZ());
    } else if (current_position.getZ() > max.getZ()) {
        max.setZ(current_position.getZ());
    }
  }
    return min.flatten().concat(max.flatten());
}

function powerOfTwoCeiling(x) {
  return Math.pow(2, Math.ceil(Math.log2(x)));
}

function moveDaLight() {
  if (Math.random() > 0.5) {
    lightCamera.advance(Math.sin(performance.now() * 0.0001));
  } else {
    lightCamera.strafe(Math.sin(performance.now() * 0.0001));
  }
  render();
}
