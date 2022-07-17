import './style.css'
import * as dat from 'lil-gui'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import particlesPositionShader from './shaders/particles/position.glsl'
import particlesVelocityShader from './shaders/particles/velocity.glsl'
import {
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
} from 'postprocessing'

class Sizes extends THREE.EventDispatcher {
  constructor() {
    super()
    this.update()
    window.addEventListener('resize', () => {
      this.update()
    })
  }

  update() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.aspect = this.width / this.height
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)
    this.dispatchEvent({ type: 'resize', target: this })
  }
}

class Mouse3D {
  constructor(camera, sizes) {
    this.camera = camera
    this.position2 = new THREE.Vector2()
    this.position3 = new THREE.Vector3()
    this.ray = new THREE.Ray()
    this.distance = 0

    const onPointerMove = (event) => {
      this.position2.x = (event.clientX / sizes.width) * 2 - 1
      this.position2.y = -(event.clientY / sizes.height) * 2 + 1
    }
    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('touchmove', (event) => {
      event.preventDefault()
      onPointerMove(event.changedTouches[0])
    })
  }

  update() {
    const { ray, camera, position2, position3 } = this
    ray.origin.copy(camera.position)
    ray.direction
      .set(position2.x, position2.y, 0.5)
      .unproject(camera)
      .sub(ray.origin)
      .normalize()

    this.distance =
      ray.origin.length() /
      Math.cos(Math.PI - ray.direction.angleTo(ray.origin))

    position3.copy(ray.direction)
    position3.multiplyScalar(this.distance)
    position3.add(ray.origin)
  }
}

class Particles {
  constructor(renderer, mouse3D, gui) {
    this.gui = gui
    this.mouse3D = mouse3D
    this.elapsedTime = 0
    this.initGPUComputationRenderer(renderer)
    this.initParticles()
  }

  initGPUComputationRenderer(renderer) {
    const textureWidth = 256
    const textureHeight = 128
    const numParticles = textureWidth * textureHeight
    const gpuCompute = new GPUComputationRenderer(
      textureWidth,
      textureWidth,
      renderer
    )
    if (renderer.capabilities.isWebGL2 === false) {
      gpuCompute.setDataType(THREE.HalfFloatType)
    }
    const texturePosition = gpuCompute.createTexture()
    const textureVelocity = gpuCompute.createTexture()
    ;(function fillTextures() {
      const positionArray = texturePosition.image.data
      const velocityArray = textureVelocity.image.data
      for (let i = 0; i < numParticles; i++) {
        const i4 = i * 4
        const r = (0.5 + Math.random() * 0.5) * 50
        const phi = (Math.random() - 0.5) * Math.PI
        const theta = Math.random() * Math.PI * 2
        positionArray[i4 + 0] = r * Math.cos(theta) * Math.cos(phi)
        positionArray[i4 + 1] = r * Math.sin(phi)
        positionArray[i4 + 2] = r * Math.sin(theta) * Math.cos(phi)
        positionArray[i4 + 3] = Math.random()
        velocityArray[i4 + 0] = 0
        velocityArray[i4 + 1] = 0
        velocityArray[i4 + 2] = 0
        velocityArray[i4 + 3] = 0
      }
    })()
    const textureDefaultPosition = texturePosition.clone()
    const positionVariable = gpuCompute.addVariable(
      'texturePosition',
      particlesPositionShader,
      texturePosition
    )
    const velocityVariable = gpuCompute.addVariable(
      'textureVelocity',
      particlesVelocityShader,
      textureVelocity
    )
    gpuCompute.setVariableDependencies(positionVariable, [
      positionVariable,
      velocityVariable,
    ])
    gpuCompute.setVariableDependencies(velocityVariable, [
      positionVariable,
      velocityVariable,
    ])
    positionVariable.material.uniforms.uTime = { value: 0.0 }
    positionVariable.material.uniforms.uDelta = { value: 0.0 }
    positionVariable.material.uniforms.uDieSpeed = { value: 0.013 }
    positionVariable.material.uniforms.uRadius = { value: 0.36 }
    positionVariable.material.uniforms.uMouse3d = { value: new THREE.Vector3() }
    positionVariable.material.uniforms.uTextureDefaultPosition = {
      value: textureDefaultPosition,
    }
    velocityVariable.material.uniforms.uTime = { value: 0.0 }
    velocityVariable.material.uniforms.uDelta = { value: 0.0 }
    velocityVariable.material.uniforms.uSpeed = { value: 1.1 }
    velocityVariable.material.uniforms.uAttraction = { value: 1 }
    velocityVariable.material.uniforms.uCurlSize = { value: 0.02 }
    velocityVariable.material.uniforms.uTimeScale = { value: 0.8 }
    velocityVariable.material.uniforms.uMouse3d = { value: new THREE.Vector3() }
    ;(() => {
      const folder = this.gui.addFolder('Particles')
      folder
        .add(velocityVariable.material.uniforms.uSpeed, 'value')
        .min(0.2)
        .max(4)
        .step(0.001)
        .name('speed')
      folder
        .add(velocityVariable.material.uniforms.uAttraction, 'value')
        .min(0)
        .max(2.5)
        .step(0.001)
        .name('attraction')
      folder
        .add(velocityVariable.material.uniforms.uCurlSize, 'value')
        .min(0.005)
        .max(0.1)
        .step(0.001)
        .name('curlSize')
      folder
        .add(velocityVariable.material.uniforms.uTimeScale, 'value')
        .min(0)
        .max(2)
        .step(0.001)
        .name('timeScale')
      folder
        .add(positionVariable.material.uniforms.uDieSpeed, 'value')
        .min(0.001)
        .max(0.03)
        .step(0.001)
        .name('dieSpeed')
      folder
        .add(positionVariable.material.uniforms.uRadius, 'value')
        .min(0)
        .max(1)
        .step(0.001)
        .name('radius')
    })()

    const error = gpuCompute.init()
    if (error !== null) {
      console.error(error)
    }

    this.numParticles = numParticles
    this.textureWidth = textureWidth
    this.gpuCompute = gpuCompute
    this.positionVariable = positionVariable
    this.velocityVariable = velocityVariable
  }

  initParticles() {
    const { textureWidth, numParticles } = this
    const particlesGeometry = (() => {
      const geom = new THREE.OctahedronGeometry()
      const refs = new Float32Array(numParticles * 2)
      for (let i = 0; i < numParticles; i++) {
        const i2 = i * 2
        refs[i2 + 0] = (i % textureWidth) / (textureWidth - 1)
        refs[i2 + 1] = ~~(i / textureWidth) / (textureWidth - 1)
      }
      geom.setAttribute(
        'aReference',
        new THREE.InstancedBufferAttribute(refs, 2)
      )
      return geom
    })()
    const particlesMaterial = this.injectParticleMotion(
      new THREE.MeshStandardMaterial({
        metalness: 0.6,
        roughness: 0.8,
        flatShading: true,
      }),
      true
    )
    const particles = new THREE.InstancedMesh(
      particlesGeometry,
      particlesMaterial,
      numParticles
    )
    particles.castShadow = true
    particles.receiveShadow = true
    particles.customDepthMaterial = this.injectParticleMotion(
      new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
      })
    )

    const instanceColors = ['#EEEEEE', '#00ADB5', '#FF5722'].map((hex) =>
      new THREE.Color(hex).convertSRGBToLinear()
    )
    const dummy = new THREE.Object3D()
    for (let i = 0; i < numParticles; i++) {
      particles.setMatrixAt(i, dummy.matrix)
      particles.setColorAt(
        i,
        instanceColors[~~(Math.pow(Math.random(), 2) * instanceColors.length)]
      )
    }

    this.node = particles
  }

  injectParticleMotion(material, transformNormal = false) {
    if (this.particlesUniforms == null) {
      this.particlesUniforms = {
        uTexturePosition: { value: null },
        uTextureVelocity: { value: null },
      }
    }

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTexturePosition = this.particlesUniforms.uTexturePosition
      shader.uniforms.uTextureVelocity = this.particlesUniforms.uTextureVelocity
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
          #include <common>

          uniform sampler2D uTexturePosition;
          uniform sampler2D uTextureVelocity;

          attribute vec2 aReference;

          mat3 getRotation(vec3 velocity) {
            velocity = normalize(velocity);
            velocity.z *= -1.;

            float xz = length( velocity.xz );
            float xyz = 1.;
            float x = sqrt( 1. - velocity.y * velocity.y );

            float cosry = velocity.x / xz;
            float sinry = velocity.z / xz;

            float cosrz = x / xyz;
            float sinrz = velocity.y / xyz;

            mat3 maty =  mat3( cosry, 0, -sinry, 0    , 1, 0     , sinry, 0, cosry );
            mat3 matz =  mat3( cosrz , sinrz, 0, -sinrz, cosrz, 0, 0     , 0    , 1 );

            return maty * matz;
          }
        `
      )

      if (transformNormal) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          `
            #include <beginnormal_vertex>

            vec4 velocityInfo = texture2D(uTextureVelocity, aReference);
            mat3 particleRotation = getRotation(velocityInfo.xyz);
            vec3 particleScale = vec3(
              min(4.0, 3.0 * length(velocityInfo.xyz)) + 2.0,
              1.0,
              1.0
            );

            objectNormal = normalize(particleRotation * objectNormal / particleScale);
          `
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
            #include <begin_vertex>

            vec4 positionInfo = texture2D(uTexturePosition, aReference);

            transformed *= positionInfo.w * particleScale;
            transformed = particleRotation * transformed;
            transformed += positionInfo.xyz;
          `
        )
      } else {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
            #include <begin_vertex>

            vec4 positionInfo = texture2D(uTexturePosition, aReference);
            vec4 velocityInfo = texture2D(uTextureVelocity, aReference);
            mat3 particleRotation = getRotation(velocityInfo.xyz);
            vec3 particleScale = vec3(
              min(4.0, 3.0 * length(velocityInfo.xyz)) + 2.0,
              1.0,
              1.0
            );

            transformed *= positionInfo.w * particleScale;
            transformed = particleRotation * transformed;
            transformed += positionInfo.xyz;
          `
        )
      }
    }
    return material
  }

  update(deltaTime) {
    const {
      positionVariable,
      velocityVariable,
      gpuCompute,
      particlesUniforms,
    } = this

    this.elapsedTime += deltaTime

    const deltaRatio = 60 * deltaTime
    positionVariable.material.uniforms.uTime.value = this.elapsedTime
    positionVariable.material.uniforms.uDelta.value = deltaRatio
    positionVariable.material.uniforms.uMouse3d.value.copy(
      this.mouse3D.position3
    )
    velocityVariable.material.uniforms.uTime.value = this.elapsedTime
    velocityVariable.material.uniforms.uDelta.value = deltaRatio
    velocityVariable.material.uniforms.uMouse3d.value.copy(
      this.mouse3D.position3
    )

    gpuCompute.compute()

    particlesUniforms.uTexturePosition.value =
      gpuCompute.getCurrentRenderTarget(positionVariable).texture
    particlesUniforms.uTextureVelocity.value =
      gpuCompute.getCurrentRenderTarget(velocityVariable).texture
  }
}

// Debug
const gui = new dat.GUI()
gui.close()

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Sizes
const sizes = new Sizes()

// Loaders
const cubeTextureLoader = new THREE.CubeTextureLoader()

// Environment map
const environmentMap = cubeTextureLoader.load([
  'textures/environmentMaps/3/px.jpg',
  'textures/environmentMaps/3/nx.jpg',
  'textures/environmentMaps/3/py.jpg',
  'textures/environmentMaps/3/ny.jpg',
  'textures/environmentMaps/3/pz.jpg',
  'textures/environmentMaps/3/nz.jpg',
])
environmentMap.encoding = THREE.sRGBEncoding

// Scene
const scene = new THREE.Scene()
scene.environment = environmentMap

// Camera
const camera = new THREE.PerspectiveCamera(45, sizes.aspect, 10, 3000)
camera.position.set(-300, 60, -300).normalize().multiplyScalar(320)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.target.y = 60
controls.maxDistance = 500
controls.minPolarAngle = 0.3
controls.maxPolarAngle = Math.PI / 2 - 0.1
controls.enablePan = false
controls.enableDamping = true

// Renderer
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
  depth: false,
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.physicallyCorrectLights = true
renderer.outputEncoding = THREE.sRGBEncoding
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.5
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)

// Composer
const composer = new EffectComposer(renderer, {
  multisampling:
    renderer.capabilities.isWebGL2 && sizes.pixelRatio === 1 ? 2 : undefined,
})
const depthOfFieldEffect = new DepthOfFieldEffect(camera, {
  focusDistance: 0.0,
  focalLength: 0.048,
  bokehScale: 2.0,
  height: 480,
})
const depthOfFieldPass = new EffectPass(camera, depthOfFieldEffect)
depthOfFieldPass.enabled = false
composer.addPass(new RenderPass(scene, camera))
composer.addPass(depthOfFieldPass)
composer.addPass(new EffectPass(camera, new VignetteEffect()))
;(() => {
  const folder = gui.addFolder('Depth of field')
  folder.add({ enabled: false }, 'enabled').onChange((value) => {
    depthOfFieldPass.enabled = value
  })
  folder.add(depthOfFieldEffect, 'bokehScale').min(0).max(4).step(0.01)
  folder
    .add(depthOfFieldEffect.circleOfConfusionMaterial, 'focalLength')
    .min(0.001)
    .max(0.2)
    .step(0.001)
})()

// Floor
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshStandardMaterial({
    roughness: 1,
    metalness: 0,
  })
)
plane.rotation.x = -Math.PI / 2
plane.position.y = -40
plane.receiveShadow = true
scene.add(plane)

// Lights
const directionalLight = new THREE.DirectionalLight('#ffffff', 4)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.set(2048, 2048)
directionalLight.shadow.camera.near = 1
directionalLight.shadow.camera.far = 800
directionalLight.shadow.camera.left = -250
directionalLight.shadow.camera.right = 250
directionalLight.shadow.camera.top = 250
directionalLight.shadow.camera.bottom = -250
directionalLight.position.set(-3, 2, -0.35).normalize().multiplyScalar(200)
scene.add(directionalLight)
// scene.add(new THREE.CameraHelper(directionalLight.shadow.camera))
const ambientLight = new THREE.AmbientLight('#ffffff', 0.15)
scene.add(ambientLight)

// Background colors
const bgColorLinear = new THREE.Color('#222321').convertSRGBToLinear()
plane.material.color = bgColorLinear
renderer.setClearColor(bgColorLinear)
scene.fog = new THREE.Fog(bgColorLinear, 500, 800)

// Particles
const mouse3D = new Mouse3D(camera, sizes)
depthOfFieldEffect.target = mouse3D.position3
const particles = new Particles(renderer, mouse3D, gui)
scene.add(particles.node)

// Resizing
sizes.addEventListener('resize', () => {
  camera.aspect = sizes.aspect
  camera.updateProjectionMatrix()

  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(sizes.pixelRatio)

  composer.setSize(sizes.width, sizes.height)
})

// Toggle animation
let isAnimationActive = true
window.addEventListener('keyup', (event) => {
  if (event.key === ' ') {
    isAnimationActive = !isAnimationActive
  }
})

// Animate
const clock = new THREE.Clock()
const tick = () => {
  const deltaTime = clock.getDelta()

  // Update controls
  controls.update()

  // Update mouse3d
  mouse3D.update()

  // GPU Compute
  if (isAnimationActive) particles.update(deltaTime)

  // Render
  composer.render()
}

renderer.setAnimationLoop(tick)
