const blessed = require('blessed')
const contrib = require('blessed-contrib')
const screen = blessed.screen()
const grid = new contrib.grid({rows: 16, cols: 16, screen: screen})


screen.render()

const ws = require('websocket')
const dotenv = require('dotenv')
dotenv.config()
const client = new ws.client()
let conn = null;
const metrics = {}
const symbols = (process.env.STOCKS || 'BINANCE:BTCUSDT,AAPL,GME,BB,PLTR,WMT,NET,TWLO,SQ').split(',')
client.on('connect', (_conn) => {
  conn = _conn
  console.log('Connected')
 
  conn.on('message', (message) => {
    if (message.type === 'utf8') {
      const data = JSON.parse(message.utf8Data)
      if (!data || !data.data || !data.data.length) {
        return
      }
      try {
        data.data.forEach(metric => {
          metrics[metric.s] = metrics[metric.s] || {data:[]}
          metrics[metric.s].data.push(metric)
          var now = new Date()
          metrics[metric.s].data = metrics[metric.s].data.filter(s => s.t >= (now.getTime() - (60*60*1000))) // Keep one hour of data
          const allPrices = metrics[metric.s].data.map(v => v.p)
          metrics[metric.s].line.options.minY = Math.min.apply(Math, allPrices)
          metrics[metric.s].line.options.maxY = Math.max.apply(Math, allPrices)
          metrics[metric.s].line.setData([
            {
              title: metric.s,
              x: metrics[metric.s].data.map(v => v.t),
              y: metrics[metric.s].data.map(v => v.p),
            }
          ])
          screen.render()

        })
      } catch (e) {console.error(e.message)}
    }
  })


  symbols.forEach((symbol, idx) => {
    metrics[symbol] = metrics[symbol] || {data:[]}
    const col = idx % 4
    const row = Math.floor(idx / 4)
    metrics[symbol].line = 
    grid.set(row * 4, col * 4, 4, 4, contrib.line,
      { style:
        { line: "yellow"
        , text: "green"
        , baseline: "black"}
      , xLabelPadding: 3
      , xPadding: 5
      , label: symbol.split(':').pop()})
      screen.render()
    conn.send(JSON.stringify({
      type: 'subscribe',
      symbol: symbol
    }), (err) => err && console.error(err))
  })
  


 

})

console.log('wss://ws.finnhub.io?token='+process.env.FINNHUB_KEY)
client.connect('wss://ws.finnhub.io?token='+process.env.FINNHUB_KEY)
