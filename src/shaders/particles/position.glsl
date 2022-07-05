uniform float uTime;
uniform float uDelta;
uniform float uDieSpeed;
uniform float uRadius;
uniform vec3 uMouse3d;
uniform sampler2D uTextureDefaultPosition;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  
  vec4 positionInfo = texture2D(texturePosition, uv);
  vec4 velocityInfo = texture2D(textureVelocity, uv);
  vec3 position = positionInfo.xyz;
  vec3 velocity = velocityInfo.xyz;
  float life = positionInfo.w - uDieSpeed * uDelta;
  
  if (life < 0.0) {
    position = texture2D(uTextureDefaultPosition, uv).xyz;
    position *= (1.0 + sin(uTime * 9.0) * 0.5) * uRadius;
    position += uMouse3d;
    life = 0.5 + fract(positionInfo.w * 21.4131 + uTime);
  } else {
    position += velocity * uDelta;
  }
  
  gl_FragColor = vec4(position, life);
}
