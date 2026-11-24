// Simulador de rastreadores: mantém veículos online transmitindo, movimenta posições,
// gera eventos e processa a fila de comandos. Substitua por integração real com o servidor de rastreadores.
const { now } = require('./db');
const { CONN } = require('./dashboard');

function start(db, intervalMs = 15000) {
  // Compensa o tempo em que o servidor ficou desligado (mantém a distribuição online/offline da demonstração)
  const gap = db.prepare(`SELECT CAST((julianday('now','localtime') - julianday(MAX(ultima_conexao))) * 86400 AS INTEGER) s FROM veiculos`).get().s;
  if (gap > 60) db.prepare(`UPDATE veiculos SET ultima_conexao = datetime(ultima_conexao, '+' || ? || ' seconds'),
    ultima_posicao = datetime(ultima_posicao, '+' || ? || ' seconds')`).run(gap, gap);

  const online = db.prepare(`SELECT v.id, v.lat, v.lng, v.velocidade, v.ignicao, v.bloqueado, v.limite_velocidade, v.odometro,
    ((julianday('now','localtime') - julianday(v.ultima_posicao)) * 24) horas_pos FROM veiculos v WHERE v.status = 'Ativo' AND ${CONN} = 'online'`);
  const updPos = db.prepare(`UPDATE veiculos SET lat=?, lng=?, velocidade=?, ignicao=?, odometro=?, ultima_posicao=?, ultima_conexao=? WHERE id=?`);
  const updConn = db.prepare('UPDATE veiculos SET ultima_conexao=? WHERE id=?');
  const evento = db.prepare('INSERT INTO eventos (veiculo_id, tipo, data, velocidade, lat, lng, descricao, tratado) VALUES (?,?,?,?,?,?,?,0)');
  const pend = db.prepare(`SELECT c.id, c.veiculo_id, c.comando, c.status, ${CONN} conexao FROM comandos c JOIN veiculos v ON v.id = c.veiculo_id
    WHERE c.status IN ('Pendente','Enviado')`);
  const setCmd = db.prepare('UPDATE comandos SET status=?, data_resposta=? WHERE id=?');
  const setBloq = db.prepare('UPDATE veiculos SET bloqueado=?, velocidade=CASE WHEN ?=1 THEN 0 ELSE velocidade END WHERE id=?');

  function tick() {
    try {
      const t = now();
      db.exec('BEGIN');
      for (const v of online.all()) {
        if (v.horas_pos > 6) { updConn.run(t, v.id); continue; } // equipamento "travado": comunica sem atualizar GPS
        let ign = v.ignicao;
        if (Math.random() < 0.006) {
          ign = ign ? 0 : 1;
          evento.run(v.id, ign ? 'Ignição ligada' : 'Ignição desligada', t, 0, v.lat, v.lng, 'Evento gerado pelo equipamento');
        }
        let vel = 0, lat = v.lat, lng = v.lng, odo = v.odometro || 0;
        if (ign && !v.bloqueado) {
          vel = Math.max(0, Math.min((v.limite_velocidade || 110) - 3, Math.round((v.velocidade || 40) + (Math.random() - 0.5) * 30)));
          if (Math.random() < 0.004) vel = (v.limite_velocidade || 110) + 5 + Math.round(Math.random() * 25);
          const dist = vel * (intervalMs / 3600000); // km
          const ang = Math.random() * Math.PI * 2;
          lat += Math.cos(ang) * dist / 111; lng += Math.sin(ang) * dist / 105;
          odo += dist;
          if (vel > (v.limite_velocidade || 110)) evento.run(v.id, 'Excesso de velocidade', t, vel, lat, lng, `Velocidade ${vel} km/h - limite ${v.limite_velocidade || 110} km/h`);
        }
        updPos.run(lat, lng, vel, ign, Math.round(odo * 10) / 10, t, t, v.id);
      }
      // Fila de comandos: online → Enviado → Confirmado; offline permanece Pendente
      for (const c of pend.all()) {
        if (c.conexao !== 'online') continue;
        if (c.status === 'Pendente') { setCmd.run('Enviado', null, c.id); continue; }
        setCmd.run('Confirmado', t, c.id);
        if (c.comando === 'Bloquear' || c.comando === 'Desbloquear') {
          const b = c.comando === 'Bloquear' ? 1 : 0;
          setBloq.run(b, b, c.veiculo_id);
          evento.run(c.veiculo_id, b ? 'Bloqueio' : 'Desbloqueio', t, 0, null, null, `Comando #${c.id} confirmado`);
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* sem transação ativa */ }
      console.error('[simulador]', e.message);
    }
  }
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { start };
