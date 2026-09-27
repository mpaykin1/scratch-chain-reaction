// Narrative-only proposals. They do NOT alter chain-engine or its four Genie options.
// CR-103 will integrate selected mechanics after economy and save-format review.
export const GENIE_ACTIONS=Object.freeze({
  desalination:Object.freeze({
    delta:Object.freeze({water:15,power:-8,eco:-2,budget:-13}),
    desc_ru:'Опреснить морскую воду. Вода появится, но станции потребуется много энергии и денег.',
    desc_en:'Desalinate seawater. Gain water, at the cost of energy and budget.'
  }),
  reforestation:Object.freeze({
    delta:Object.freeze({eco:15,water:8,food:3,budget:-12}),
    desc_ru:'Восстановить лес и водосбор. Урожай и вода вырастут не сразу, а вложиться придётся сейчас.',
    desc_en:'Restore forests and the watershed. Water and crops recover gradually, but the investment is immediate.'
  }),
  field_hospital:Object.freeze({
    delta:Object.freeze({population:5,food:-3,budget:-8}),
    desc_ru:'Развернуть полевой госпиталь. Больше людей переживут кризис, но возрастёт потребность в пище.',
    desc_en:'Set up a field hospital. More people survive, increasing food demand.'
  }),
  battery_grid:Object.freeze({
    delta:Object.freeze({power:16,eco:-4,budget:-12}),
    desc_ru:'Построить накопители энергии. Перебои сократятся, но производство батарей оставит экологический след.',
    desc_en:'Build grid batteries. Outages fall, but battery production carries an environmental cost.'
  }),
  water_rationing:Object.freeze({
    delta:Object.freeze({water:9,food:-8,budget:3}),
    desc_ru:'Ввести строгие лимиты воды. Резерв продержится дольше, но сельское хозяйство понесёт потери.',
    desc_en:'Ration water. Reserves last longer, but agriculture loses output.'
  })
});
