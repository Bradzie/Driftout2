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
    }
}