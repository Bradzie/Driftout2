module.exports = {
  square: {
    displayName: 'Square',
    start: {
      type: 'polygon',
      vertices: [
        { x: 140, y: -20 },
        { x: 160, y: -20 },
        { x: 160, y: 20 },
        { x: 140, y: 20 }
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
        borderColors: ['#ff0000', '#ffffff'],
        borderWidth: 10
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
        borderColors: ['#ff0000', '#ffffff'],
        borderWidth: 10
      }
    ],
    checkpoints: [
      {
        type: 'line',
        vertices: [{ x: 100, y: -100 }, { x: 100, y: 100 }],
        id: 'checkpoint-1'
      },
      {
        type: 'line',
        vertices: [{ x: 0, y: -150 }, { x: 200, y: -150 }],
        id: 'checkpoint-2'
      }
    ]
  },

  circle: {
    displayName: 'Circle',
    start: { x: (150 + 300) / 2, y: 0 },
    shapes: [
      {
        type: 'circle',
        center: { x: 0, y: 0 },
        radius: 300,
        hollow: false,
        borderColors: ['#ff0000', '#ffffff'],
        borderWidth: 20
      },
      {
        type: 'circle',
        center: { x: 0, y: 0 },
        radius: 150,
        hollow: false,
        borderColors: ['#ff0000', '#ffffff'],
        borderWidth: 20
      }
    ]
  }
};