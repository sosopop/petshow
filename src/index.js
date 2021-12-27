// https://createapp.dev/webpack/no-library
import ReconnectingWebSocket from "reconnecting-websocket";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @type ReconnectingWebSocket
 */
let ws;
let hasMaster = false;
let master = false;
let clientId = uuidv4();
let clientMap = new Map();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
renderer.physicallyCorrectLights = true;
renderer.autoClear = false;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setClearColor( 0x000000, 0 );
renderer.sortObjects = false;

let windowWidth = window.innerWidth;
let windowHeight = window.innerHeight;

renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize(windowWidth, windowHeight);

document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  31.5,
  windowWidth/windowHeight,
  0.1,
  10000
);

camera.position.set(500, 200, 0);
camera.lookAt(-300, 0, 0);

window.addEventListener('resize', function(event) {
  windowWidth = window.innerWidth;
  windowHeight = window.innerHeight;
  renderer.setSize(windowWidth, windowHeight);
  camera.aspect = windowWidth/windowHeight;
  camera.updateProjectionMatrix();
}, true);

const scene = new THREE.Scene();
scene.visible = true;

// const size = 1000;
// const divisions = 10;
// const gridHelper = new THREE.GridHelper( size, divisions );
// scene.add( gridHelper );

// const axesHelper = new THREE.AxesHelper( 100 );
// scene.add( axesHelper );

/**
 * @type THREE.AnimationMixer
 */
let mixer;
let clock = new THREE.Clock();
let clock_test = new THREE.Clock();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight( 0xffffff, 1 );
scene.add( directionalLight );

const MANAGER = new THREE.LoadingManager();
const loader = new FBXLoader( MANAGER ).setCrossOrigin('anonymous');


const pmremGenerator = new THREE.PMREMGenerator( renderer );
pmremGenerator.compileEquirectangularShader();
function getCubeMapTexture ( path ) {
  if ( ! path ) return Promise.resolve( { envMap: null } );
  return new Promise( ( resolve, reject ) => {
    new RGBELoader()
      .setDataType( THREE.UnsignedByteType )
      .load( path, ( texture ) => {
        const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
        pmremGenerator.dispose();
        resolve( { envMap } );
      }, undefined, reject );

  });
}

class AnimationWalk {
  /**
   * 
   * @param {THREE.Vector3} pos 
   */
  constructor(pos) {
    this.pos = pos;
  }
  /**
   * 
   * @param {THREE.Group} model 
   * @param {THREE.AnimationMixer} mixer 
   */
  bind(model, mixer) {
    this.model = model;
    this.mixer = mixer;
    this.clip = this.model.animations.find((o)=>{
      return o.name == "BuddyDroid_01_rig.ao|BuddyDroid_NAV_SlowWalk";
    });
  }
  play() {
    this.action = this.mixer.clipAction(this.clip, this.model);
    this.action.reset();
    this.action.setLoop(THREE.LoopRepeat);
    this.action.play();
  }
  update(delta) {
    if(delta <= 0)
      return true;
    let norVec = this.pos.clone().sub(this.model.position).normalize();
    let modelPosVec = this.model.position.clone();
    modelPosVec = modelPosVec.add(norVec.clone().multiplyScalar(delta*23));
    let checkNorVect = this.pos.clone().sub(modelPosVec).normalize();
    let distance = checkNorVect.distanceTo(norVec);
    if(distance > 0.1) {
      /**
       * 移动前和移动后的单位向量如果差很多，则认为已经移动到了目标位置
       */
      this.model.position.copy(this.pos);
      this.action.reset();
      this.action.stop();
      return false;
    }
    this.model.position.copy(modelPosVec);
    return true;
  }
}

class AnimationWalkTurn {
  /**
   * 
   * @param {number} pos 
   */
  constructor(pos) {
    this.pos = pos;
  }
  /**
   * 
   * @param {THREE.Group} model 
   * @param {THREE.AnimationMixer} mixer 
   */
  bind(model, mixer) {
    this.model = model;
    this.mixer = mixer;
    this.clip = this.model.animations.find((o)=>{
      return o.name == "BuddyDroid_01_rig.ao|BuddyDroid_NAV_SlowWalk";
    });
  }
  play() {
    let position  = this.model.position.clone();
    position.y = 0;
    let targetNormal = this.pos.clone().sub(position).normalize();

    this.beginLookAt = new THREE.Vector3( 0, 0, 1 );
    this.beginLookAt.applyQuaternion( this.model.quaternion );
    this.angle = targetNormal.angleTo(this.beginLookAt);
    if(targetNormal.cross(this.beginLookAt).y > 0) {
      this.angle = -this.angle;
    }

    this.action = this.mixer.clipAction(this.clip, this.model);
    this.action.reset();
    this.action.setLoop(THREE.LoopOnce);
    this.action.play();
    this.duration = 0;
    this.totalDuration = 0.3;
    
  }
  update(delta) {
    let lookAt = this.beginLookAt.clone();
    this.duration += delta;
    let stoped = false;
    if(this.duration > this.totalDuration) {
      this.duration = this.totalDuration;
      stoped = true;
      this.action.stop();
    }
    lookAt.applyAxisAngle(this.model.up, this.angle * this.duration / this.totalDuration).add(this.model.position);
    //console.log(lookAt);
    this.model.lookAt(lookAt);
    return !stoped;
  }
}

class AnimationRun {
  /**
   * 
   * @param {THREE.Vector3} pos 
   */
  constructor(pos) {
    this.pos = pos;
  }
  /**
   * 
   * @param {THREE.Group} model 
   * @param {THREE.AnimationMixer} mixer 
   */
  bind(model, mixer) {
    this.model = model;
    this.mixer = mixer;
    this.clip = this.model.animations.find((o)=>{
      return o.name == "BuddyDroid_01_rig.ao|BuddyDroid_NAV_Walk";
    });
  }
  play() {
    this.action = this.mixer.clipAction(this.clip, this.model);
    this.action.reset();
    this.action.setLoop(THREE.LoopRepeat);
    this.action.play();

  }
  update(delta) {
    if(delta <= 0)
      return true;
    let norVec = this.pos.clone().sub(this.model.position).normalize();
    let modelPosVec = this.model.position.clone();
    modelPosVec = modelPosVec.add(norVec.clone().multiplyScalar(delta*60));
    let checkNorVect = this.pos.clone().sub(modelPosVec).normalize();
    let distance = checkNorVect.distanceTo(norVec);
    if(distance > 0.1) {
      /**
       * 移动前和移动后的单位向量如果差很多，则认为已经移动到了目标位置
       */
      this.model.position.copy(this.pos);
      this.action.reset();
      this.action.stop();
      return false;
    }
    this.model.position.copy(modelPosVec);
    return true;
  }
}

class AnimationMotion {
  /**
   * 
   * @param {THREE.Vector3} pos 
   */
  constructor(pos, name) {
    this.pos = pos;
    this.name = name;
  }
  /**
   * 
   * @param {THREE.Group} model 
   * @param {THREE.AnimationMixer} mixer 
   */
  bind(model, mixer) {
    this.model = model;
    this.mixer = mixer;
    this.clip = this.model.animations.find((o)=>{
      return o.name == this.name;
    });
  }
  play() {
    this.action = this.mixer.clipAction(this.clip, this.model);
    this.action.reset();
    this.action.setLoop(THREE.LoopOnce);
    this.action.play();
  }
  update(delta) {
    if(!this.action.isRunning()) {
      return false;
    }
    return true;
  }
}

class AnimationMove {
  /**
   * 
   * @param {THREE.Vector3} pos 
   */
  constructor(pos) {
    this.pos = pos;
  }
  /**
   * 
   * @param {THREE.Group} model 
   * @param {THREE.AnimationMixer} mixer 
   */
  bind(model, mixer) {
    this.model = model;
  }
  play() {
    this.model.position.copy(this.pos);
  }
  update(delta) {
    return false;
  }
}

class AnimationCollection {
  /**
   * @param {THREE.Group} model 
   */
  constructor(model) {
    this.collection = []; 
    this.index = 0;
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
  }
  add(animation) {
    animation.bind(this.model, this.mixer);
    this.collection.push(animation);
  }
  update(delta) {
    if(this.index >= this.collection.length) {
      return false;
    }
    this.mixer.update(delta);
    let animation = this.collection[this.index];
    if(animation.update(delta)) {
      return true;
    }
    this.index++;
    if(this.index >= this.collection.length) {
      this.finishCallback();
      return false;
    }
    animation = this.collection[this.index];
    animation.play();
  }
  play(callback) {
    this.finishCallback = callback;
    if(this.index >= this.collection.length) {
      return false;
    }
    let animation = this.collection[this.index];
    animation.play();
  }
}

/**
 * @type AnimationCollection
 */
let animCollection = null;

/**
 * @type THREE.Group
 */
let robotModel;
/**
 * @type THREE.AnimationAction
 */
let currentClipAction;

function updataAnimation() {
  if(!robotModel)
    return;
  let delta = clock.getDelta();
  if(animCollection)
    animCollection.update(delta);
  // console.log(robotModel.position);
}

function newAnimation() {
  if(ws) {
    ws.send(JSON.stringify({
      "type":"notify",
      "id":clientId,
      master
    }));
  }
  console.log("开始播放动画");
  function randomMotion() {
    let anis = [
      "BuddyDroid_01_rig.ao|BuddyDroid_NAV_Idle03",
      "BuddyDroid_01_rig.ao|BuddyDroid_NAV_Idle02",
      "BuddyDroid_01_rig.ao|BuddyDroid_NAV_IdleAlert",
      "BuddyDroid_01_rig.ao|BuddyDroid_NAV_Idle04"
    ];
    return new AnimationMotion(null, anis[parseInt(Math.random()*4)]);
  }
  animCollection = new AnimationCollection(robotModel);
  animCollection.add(new AnimationMove(new THREE.Vector3(0, 0, 300)));
  animCollection.add(new AnimationWalkTurn(new THREE.Vector3(0, 0, 0)));
  animCollection.add(new AnimationRun(new THREE.Vector3(0, 0, 0)));
  for (let i = 0; i < 2; i++) {
    animCollection.add(randomMotion());
    let target = new THREE.Vector3(100 - Math.random() * 200, 0, 200 - Math.random() * 400);
    animCollection.add(new AnimationWalkTurn(target));
    animCollection.add(new AnimationWalk(target));
  }
  animCollection.add(new AnimationWalkTurn(new THREE.Vector3(0, 0, 0)));
  animCollection.add(new AnimationRun(new THREE.Vector3(0, 0, 0)));
  animCollection.add(randomMotion());
  animCollection.add(new AnimationWalkTurn(new THREE.Vector3(0, 0, -300)));
  animCollection.add(new AnimationRun(new THREE.Vector3(0, 0, -300)));
  robotModel.visible = true;
  animCollection.play(()=>{
    console.log("动画结束");
    robotModel.visible = false;
    let t = new Date().getTime();
    clientMap.forEach((v,k)=>{
      if(t - v > 10000) {
        console.log(k + ", 离开");
        clientMap.delete(k);
      }
    });

    if(clientMap.size == 0) {
      newAnimation();
    } else {
      let items = Array.from(clientMap);
      let selectId = items[Math.floor(Math.random() * items.length)][0];
      if(ws) {
        ws.send(JSON.stringify({
          "type":"switch",
          "id":selectId
        }));
      }
      console.log("切换到客户端 " + selectId);
      master = false;
    }
  });
}

function reloadModel() {
  loader.setResourcePath('./models/star-wars-buddydroid-animated-rigged/textures/');
  loader.load(
    "./models/star-wars-buddydroid-animated-rigged/source/BuddyDroid.fbx",
    function (model) {
      robotModel = model;
      robotModel.visible = false;
      model.up.set(0, 1, 0);
      model.lookAt(0, 0, 1);
      scene.add(model);
      // let bbox = new THREE.Box3().setFromObject(gltf.scene);
      // let size = bbox.getSize(new THREE.Vector3());
      // let maxAxis = Math.max(size.x, size.y, size.z);

      // let matrix = new THREE.Matrix4();
      // matrix.identity();
      // matrix.setPosition(0, -bbox.min.y - (bbox.max.y-bbox.min.y) / 2, 0);
      // matrix.multiplyScalar(500.0 / maxAxis);
      // gltf.scene.applyMatrix4(matrix);

      model.traverse(function(child) {
          if (child.isMesh) {
              if (child.material) {
                for(let m of child.material) {
                  switch (m.name) {
                    case "M_BD1_Head_Body":
                      //m.normalMap = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Head_Body_N.tga.png');
                      m.map = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Head_Body_C.tga.png');
                      break;
                    case "M_BD1_Legs":
                      //m.normalMap = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Legs_N.tga.png');
                      m.map = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Legs_C.tga.png');
                      break;
                    case "M_BD1_Overcharge_001":
                      //m.normalMap = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Overcharge_001_N.tga.png');
                      m.map = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Overcharge_001_C.tga.png');
                      break;
                    case "M_BD1_EyeRefract_Inst":
                      //m.normalMap = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Eyes_N.tga.png');
                      m.map = new THREE.TextureLoader().load('./models/star-wars-buddydroid-animated-rigged/source/BD1_Eyes_C.tga.png');
                      break;
                    default:
                      break;
                  }
                }
              }
              child.castShadow = true;
              child.receiveShadow = true;
          }
      });

      mixer = new THREE.AnimationMixer(model);
      // for(let ani of model.animations) {
      //   let e = document.createElement("a");
      //   e.innerText = ani.name.split("|")[1];
      //   e.href = "#";
      //   e.addEventListener("click", ((name)=>{
      //     return (event)=>{
      //       let clip = robotModel.animations.find((o)=>{
      //         return o.name == name;
      //       });
      //       if(currentClipAction) {
      //         currentClipAction.stop();
      //       }
      //       currentClipAction = mixer.clipAction(clip);
      //       currentClipAction.reset();
      //       currentClipAction.setLoop(THREE.LoopRepeat).play();
      //     }
      //   })(ani.name));
      //   document.getElementById("animation_list").appendChild(e);
      //   document.getElementById("animation_list").insertAdjacentHTML("beforeend", "<br>");
      // }
      // getCubeMapTexture( "./environment/footprint_court_2k.hdr" ).then(( { envMap } ) => {
      //   scene.environment = envMap;
      // });
    },
    function (xhr) {
      console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    function (error) {
      console.log("An error happened " + error);
    }
  );
}
reloadModel();


// const controls = new OrbitControls(camera, renderer.domElement);
// controls.autoRotate = false;
//controls.update();
function animate() {
  requestAnimationFrame(animate);

  if (mixer) mixer.update(clock_test.getDelta());
  updataAnimation();
  //controls.update();
  renderer.clear();
  renderer.render(scene, camera);
}

animate();

function connectWS( callback ) {
  ws = new ReconnectingWebSocket("ws://192.168.5.81:8080/", null, {reconnectInterval: 1000});
  ws.onopen = () => {
    console.log("websocket open");
  };
  ws.onerror = (error) => {
    console.error(error);
  };
  ws.onmessage = (message) => {
    if(!message.data)
      return;
    try {
      let json = JSON.parse(message.data);
      callback(json);
    } catch (error) {
      console.error(error);
    }};
  ws.onclose = () => {
    console.log("websocket close");
  };
}

let lastMasterActionTime = new Date().getTime();

connectWS(( data )=>{
  if(data.type === "notify") {
    if(data.id !== clientId) {
      console.log("recv client notify " + data.id);
      clientMap.set(data.id, new Date().getTime());
    }
    if(data.master) {
      lastMasterActionTime = new Date().getTime();
    }
  } else if(data.type === "switch") {
    if(!master && data.id === clientId) {
      console.log("recv client switch " + data.id);
      master = true;
      newAnimation();
    }
  }
});

setInterval(() => {
  console.log("check");
  if(ws && robotModel) {
    ws.send(JSON.stringify({
      "type":"notify",
      "id":clientId,
      master,
    }));

    if(master) {
      lastMasterActionTime = new Date().getTime();
    } else {
      if(new Date().getTime() - lastMasterActionTime > 10000) {
        master = true;
        newAnimation();
      }
    }
  }
}, 3000);