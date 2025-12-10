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
            isStatic: shape.isStatic !== false,
            friction: shape.friction ?? 0.2,
            restitution: shape.restitution ?? 0.5,
            density: shape.density ?? 0.001
        }
    },

    circleToPolygon: function(radius, segments = 24, center = { x: 0, y: 0 }) {
        const verts = []
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * 2 * Math.PI
            verts.push({
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle)
            })
        }
        return verts
    },

    pointInPolygon: function(x, y, vertices) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            if (yi === yj && yi === y) {
                if (x >= Math.min(xi, xj) && x <= Math.max(xi, xj)) {
                    return true;
                }
            }

            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    parseMapKey: function(roomMapKey) {
        if (!roomMapKey || !roomMapKey.includes('/')) {
            return { category: null, key: roomMapKey };
        }
        const parts = roomMapKey.split('/');
        return { category: parts[0], key: parts[1] };
    }
}