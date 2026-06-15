function createSweepParticle(modelIndex, particleIndex) {
  const angle = ((((modelIndex + 1) * 83) + particleIndex * 47) * Math.PI) / 180
  const radius = 20 + ((modelIndex * 19 + particleIndex * 11) % 34)

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    delay: 0.08 * particleIndex,
    duration: 0.65 + ((modelIndex + particleIndex) % 4) * 0.18,
    scale: 0.6 + ((modelIndex * 3 + particleIndex) % 5) * 0.12,
  }
}

// 扫描线爆点参数在模块级预生成，避免组件重渲染时粒子轨迹跳变。
export const FEATURE_MODEL_SCAN_PARTICLES = Array.from({ length: 3 }, (_, modelIndex) =>
  Array.from({ length: 8 }, (_, particleIndex) =>
    createSweepParticle(modelIndex, particleIndex),
  ),
)
