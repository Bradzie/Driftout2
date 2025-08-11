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
        type: 'polygon',
        vertices: [
          { x: -600, y: -600 },
          { x:  600, y: -600 },
          { x:  600, y:  600 },
          { x: -600, y:  600 }
        ],
        hollow: false,
        fillColor: [100, 100, 100],
        borderColors: ['#ff4d4d', '#ffffff'],
        borderWidth: 20
      },
      {
        type: 'polygon',
        vertices: [
          { x: -400, y: -400 },
          { x:  400, y: -400 },
          { x:  400, y:  400 },
          { x: -400, y:  400 }
        ],
        hollow: false,
        borderColors: ['#ff4d4d', '#ffffff'],
        borderWidth: 20
      }
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