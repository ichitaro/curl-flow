uniform float uTime;
uniform float uDelta;
uniform float uSpeed;
uniform float uAttraction;
uniform float uCurlSize;
uniform float uTimeScale;
uniform vec3 uMouse3d;

#pragma glslify: curl = require('../helpers/curl4')

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 positionInfo = texture2D(texturePosition, uv);
  vec3 position = positionInfo.xyz;
  float life = positionInfo.a;
  
  vec3 toMouse = uMouse3d - position;
  vec3 velocity = toMouse * (1.0 - smoothstep(50.0, 350.0, length(toMouse))) * (0.005 + life * 0.01) * uAttraction;
  velocity += curl(position * uCurlSize, uTime * uTimeScale, 0.1 + (1.0 - life) * 0.1);
  velocity *= uSpeed;

  gl_FragColor = vec4(velocity, 0.0);
}
