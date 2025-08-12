// TODO: Add isStatic:false compatability - dynamic map props will need to be added as part of the socket update loop, client currently receives only one set of shapes for map gen at the beginning of match

module.exports = {
  square: {
    displayName: 'Square',
    start: {
      type: 'polygon',
      vertices: [
        { x: 400, y: -10 },
        { x: 600, y: -10 },
        { x: 600, y: 10 },
        { x: 400, y: 10 }
      ]
    },
    shapes: [
      {
        vertices: [
          { x: -600, y: -600 },
          { x:  600, y: -600 },
          { x:  600, y:  600 },
          { x: -600, y:  600 }
        ],
        fillColor: [100, 100, 100],
        borderColors: ['#ff4d4d', '#ffffff'],
        borderWidth: 20
      },
      {
        vertices: [
          { x: -400, y: -100 },
          { x: -100, y: -100 },
          { x: -100, y: -400 },
          { x:  400, y: -400 },
          { x:  400, y:  400 },
          { x: -400, y:  400 }
        ],
        borderColors: ['#ff4d4d', '#ffffff'],
        borderWidth: 20
      },
      {
        vertices: [
          { x: -400, y: -400 },
          { x:  -200, y: -400 },
          { x:  -200, y:  -200 },
          { x: -400, y:  -200 }
        ],
        borderColors: ['#ff4d4d', '#ffffff'],
        borderWidth: 20
      },
      {
        vertices: circleToPolygon(25, 10, { x: 500, y: 500 }),
        borderColors: ['#ff4d4d', '#ffffff'],
        borderWidth: 5
      },
    ],
    checkpoints: [
      {
        type: 'line',
        vertices: [{ x: 0, y: -400 }, { x: 0, y: -600 }],
        id: 'checkpoint-1'
      },
      {
        type: 'line',
        vertices: [{ x: -400, y: 0 }, { x: -600, y: 0 }],
        id: 'checkpoint-2'
      },
      {
        type: 'line',
        vertices: [{ x: 0, y: 400 }, { x: 0, y: 600 }],
        id: 'checkpoint-3'
      },
    ]
  },
};

function circleToPolygon(radius, segments = 24, center = { x: 0, y: 0 }) {
  const verts = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI
    verts.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    })
  }
  return verts
}