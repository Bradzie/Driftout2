module.exports = {
  square: {
    displayName: 'Square',
    start: { x: (150 + 300) / 2, y: 0 },
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
        borderColors: ['#ff0000', '#ffffff'],
        borderWidth: 4
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
        borderWidth: 4
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
        borderWidth: 4
      },
      {
        type: 'circle',
        center: { x: 0, y: 0 },
        radius: 150,
        hollow: false,
        borderColors: ['#ff0000', '#ffffff'],
        borderWidth: 4
      }
    ]
  }
};