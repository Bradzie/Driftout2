module.exports = {
    shortestAngle: function(a) {
        return ((a + Math.PI) % (2 * Math.PI)) - Math.PI
    },

    lerpAngle: function(a, b, t) {
        const d = this.shortestAngle(b - a)
        return a + d * t
    },

    clamp: function(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v))
    },

    segmentSide: function(ax, ay, bx, by, px, py) {
      return Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax))
    },

    getBodyOptionsFromShape: function(shape) {
        return {
            isStatic: shape.isStatic !== false,       // default: true
            friction: shape.friction ?? 0.2,
            restitution: shape.restitution ?? 0.5,
            density: shape.density ?? 0.001
        }
    }
}