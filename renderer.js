const APP = {
    db: { produtos: [], auditoria: [], fila: [], movimento: [], pdv: [] },
    rankings: { produtos: [] },

    async init() {
        const st = document.getElementById('engine-status');
        try {
            const t = Date.now();
            const [p, a, m, v] = await Promise.all([
const base = './'; // ou ajuste se estiver em subpasta

const [p, a, m, v] = await Promise.all([
    fetch(`${base}produtos.json?t=${t}`).then(r => r.json()),
    fetch(`${base}auditoria.json?t=${t}`).then(r => r.json()),
    fetch(`${base}movimento.json?t=${t}`).then(r => r.json()),
    fetch(`${base}pdv.json?t=${t}`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
]);


                fetch(`pdv.json?t=${t}`).catch(() => []).then(r => r.json ? r.json() : [])
            ]);
            
            this.db.auditoria = a; 
            this.db.movimento = m; 
            this.db.pdv = v;
            
            this.processarEstoque(p);
            this.processarRanking(); 
            
            st.innerText = '● K11 ONLINE'; 
            st.style.color = 'var(--success)';
            this.view('dash', document.querySelector('.nav-btn'));
        } catch (e) { 
            st.innerText = 'OFFLINE'; 
            st.style.color = 'var(--danger)';
            console.error(e);
        }
    },

    processarEstoque(data) {
        const mapa = {};
        data.forEach(p => {
            const sku = String(p["Produto"] || p["Nº do produto"] || "").trim();
            if (!sku) return;

            if (!mapa[sku]) {
                mapa[sku] = { 
                    id: sku, 
                    desc: p["Descrição produto"] || p["Texto breve material"] || "NOME NÃO LOCALIZADO", 
                    depositos: [], 
                    qtdTotal: 0,
                    valTotal: 0 
                };
            }

            const q = parseFloat(String(p["Quantidade"] || "0").replace(',', '.'));
            mapa[sku].depositos.push({ 
                pos: p["Posição no depósito"] || "S/E", 
                tipo: String(p["Tipo de depósito"] || "").toUpperCase(), 
                q: q 
            });
            mapa[sku].qtdTotal += q;
            mapa[sku].valTotal += parseFloat(p["Valor total"] || 0);
        });

        this.db.produtos = Object.values(mapa).map(p => {
            const sPKL = p.depositos.filter(d => d.tipo === "PKL").reduce((a, b) => a + b.q, 0);
            const sRES = p.depositos.filter(d => d.tipo !== "PKL").reduce((a, b) => a + b.q, 0);
            
            if (p.qtdTotal <= 0) p.status = 'ruptura';
            else if (sPKL <= 0 && sRES > 0) p.status = 'abastecimento';
            else p.status = 'saudavel';
            
            return p;
        });
    },

    processarRanking() {
        const vds = {};
        this.db.pdv.forEach(v => {
            const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
            const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));
            if (id && q > 0) vds[id] = (vds[id] || 0) + q;
        });
        
        this.rankings.produtos = Object.entries(vds)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, q]) => {
                const pInfo = this.db.produtos.find(x => x.id === id);
                return { id, q, desc: pInfo ? pInfo.desc : "PRODUTO FORA DE ESTOQUE" };
            });
    },

    views: {
        dash() {
            const nR = APP.db.produtos.filter(x => x.status === 'ruptura').length;
            const nA = APP.db.produtos.filter(x => x.status === 'abastecimento').length;
            const vT = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);

            setTimeout(() => APP.animateValue('val-inv', 0, vT, 1000), 50);

            return `
                <div class="op-card alert-p">
                    <div class="ai-badge">VALOR EM ESTOQUE</div>
                    <div class="mono" style="font-size:24px; color:var(--p)">R$ <span id="val-inv">0</span></div>
                </div>

                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('estoque', null, 'ruptura')">
                        <span class="label">Rupturas</span><b style="color:var(--danger)">${nR}</b>
                    </div>
                    <div class="kpi-btn" onclick="APP.view('estoque', null, 'abastecimento')">
                        <span class="label">Repor PKL</span><b style="color:var(--p)">${nA}</b>
                    </div>
                </div>

                <div class="op-card">
                    <span class="label">Top Giro (Saídas PDV)</span>
                    ${APP.rankings.produtos.map(r => `
                        <div style="padding:10px 0; border-bottom:1px solid #222">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
                                <b class="mono" style="color:var(--p); font-size:14px">${r.id}</b>
                                <span class="ai-badge" style="margin:0">${r.q} un</span>
                            </div>
                            <div class="label truncate" style="color:var(--txt); font-size:11px; opacity:0.9">${r.desc}</div>
                        </div>
                    `).join('') || '<div class="label">Sem dados de giro</div>'}
                </div>
                
                <div class="kpi-row">
                    <div class="kpi-btn" style="text-align:left">
                        <span class="label">Entradas</span><b class="mono">${APP.db.auditoria.length}</b>
                    </div>
                    <div class="kpi-btn" style="text-align:left">
                        <span class="label">Tarefas</span><b class="mono">${APP.db.movimento.length}</b>
                    </div>
                </div>`;
        },

        bipar() {
            return `
                <div class="op-card">
                    <span class="label">1. SKU</span>
                    <input type="number" id="sk-in" class="op-input" autofocus>
                    <span class="label">2. Quantidade</span>
                    <input type="number" id="qt-in" class="op-input">
                    <button onclick="APP.actions.addFila()" class="pos-tag">LANÇAR NA LISTA</button>
                </div>`;
        },

        operacional() {
            return APP.db.fila.map((t, i) => `
                <div class="op-card alert-s">
                    <div style="display:flex; justify-content:space-between">
                        <div>
                            <b class="mono">${t.id}</b>
                            <div class="label" style="color:#fff">${t.desc}</div>
                            <div class="ai-badge" style="margin-top:5px">MOVER: ${t.qtdSolicitada} UN</div>
                        </div>
                        <span class="material-symbols-outlined" onclick="APP.actions.remFila(${i})" 
                              style="color:var(--success); font-size:40px; cursor:pointer">check_circle</span>
                    </div>
                    <div class="label" style="color:var(--p); margin-top:10px">POSIÇÕES:</div>
                    ${t.depositos.map(d => `<div class="end-box mono"><span><b>${d.tipo}</b> | ${d.pos}</span><span>Saldo: ${d.q}</span></div>`).join('')}
                </div>`).join('') || '<div class="op-card" style="text-align:center">Vazio</div>';
        },

        estoque(f = 'ruptura') {
            const lista = APP.db.produtos.filter(p => p.status === f);
            return `
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('estoque', null, 'ruptura')" style="${f==='ruptura'?'border-color:var(--danger)':''}">RUPTURA</div>
                    <div class="kpi-btn" onclick="APP.view('estoque', null, 'abastecimento')" style="${f==='abastecimento'?'border-color:var(--p)':''}">ABASTECER</div>
                </div>
                ${lista.map(p => `
                    <div class="op-card" onclick="APP.actions.preencher('${p.id}')">
                        <b class="mono">${p.id}</b>
                        <div class="label" style="color:#fff">${p.desc}</div>
                        <div style="margin-top:8px">
                            ${p.depositos.map(d => `
                                <div class="end-box mono" style="font-size:10px; padding:4px">
                                    <span>${d.tipo} | ${d.pos}</span><b>${d.q}</b>
                                </div>`).join('')}
                        </div>
                    </div>`).join('')}`;
        },

        rastreio() {
            return `<div class="op-card"><span class="label">SKU</span><input type="number" id="sk-r" class="op-input"><button onclick="APP.actions.rastrear()" class="pos-tag">BUSCAR</button></div><div id="res"></div>`;
        }
    },

    actions: {
        addFila() {
            const s = document.getElementById('sk-in').value.trim();
            const q = parseFloat(document.getElementById('qt-in').value);
            const p = APP.db.produtos.find(x => x.id === s);
            if(!p) return alert("SKU não encontrado!");
            if(!q || q <= 0) return alert("Quantidade inválida!");
            if(q > p.qtdTotal) return alert(`Saldo insuficiente: ${p.qtdTotal}`);
            APP.db.fila.push({ ...p, qtdSolicitada: q });
            APP.view('operacional');
        },
        preencher(id) {
            APP.view('bipar');
            setTimeout(() => { document.getElementById('sk-in').value = id; document.getElementById('qt-in').focus(); }, 100);
        },
        remFila(i) { APP.db.fila.splice(i, 1); APP.view('operacional'); },
        rastrear() {
            const v = document.getElementById('sk-r').value.trim();
            if(!v) return;
            const pInfo = APP.db.produtos.find(x => x.id === v);
            const hM = APP.db.movimento.filter(m => String(m["Produto"]) === v);
            const hA = APP.db.auditoria.filter(a => String(a["Produto"] || a["Nº do produto"]) === v);
            
            let h = "";
            if(pInfo) {
                h += `<div class="op-card alert-s"><div class="label">ESTOQUE ATUAL</div><b class="mono">${pInfo.id}</b><div class="label" style="color:#fff">${pInfo.desc}</div><div style="margin-top:8px">${pInfo.depositos.map(d => `<div class="end-box mono"><span>${d.tipo} | ${d.pos}</span><b>${d.q}</b></div>`).join('')}</div></div>`;
            }
            h += hA.map(a => `<div class="op-card alert-p"><div class="ai-badge">ENTRADA</div><div class="mono">${a["Fornecedor"] || "DOCA"}</div><div class="label">LDAP: ${a["Autor"] || a["Usuário"]}</div></div>`).join('');
            h += hM.slice(-5).reverse().map(m => `<div class="op-card"><div class="ai-badge" style="background:#444">MOVIMENTAÇÃO</div><div class="mono">${m["PD origem"]} ➔ ${m["PD destino"]}</div><div class="label" style="color:var(--p)">LDAP: ${m["Autor"] || m["Confirmado por"]}</div></div>`).join('');
            document.getElementById('res').innerHTML = h || '<div class="op-card">Vazio</div>';
        }
    },

    view(v, btn, p) {
        if(btn) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
        document.getElementById('stage').innerHTML = this.views[v] ? this.views[v](p) : '';
    },

    animateValue(id, start, end, duration) {
        const obj = document.getElementById(id); if(!obj) return;
        let startT = null;
        const step = (t) => {
            if (!startT) startT = t;
            const progress = Math.min((t - startT) / duration, 1);
            obj.innerHTML = (progress * (end - start) + start).toLocaleString('pt-BR', {minimumFractionDigits: 2});
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }
};
window.onload = () => APP.init();
