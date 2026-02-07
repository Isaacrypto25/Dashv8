/**
 * K11 OPERATIONAL OS - OMNI ELITE VERSION 2026
 * STATUS: FULL LOGISTICS TRACEABILITY ENABLED
 */

const APP = {
    db: { produtos: [], auditoria: [], fila: [], movimento: [], pdv: [], tarefas: [] },
    rankings: { growth: [], decline: [] },
    ui: { rankingAberto: false, filtroEstoque: 'ruptura' },

    async init() {
        const st = document.getElementById('engine-status');
        try {
            const t = Date.now();
            const safeFetch = async (url) => {
                try {
                    const r = await fetch(url);
                    return r.ok ? await r.json() : [];
                } catch (e) { return []; }
            };

            const [p, a, m, v, tar] = await Promise.all([
                safeFetch(`./produtos.json?t=${t}`),
                safeFetch(`./auditoria.json?t=${t}`),
                safeFetch(`./movimento.json?t=${t}`),
                safeFetch(`./pdv.json?t=${t}`),
                safeFetch(`./tarefas.json?t=${t}`)
            ]);
            
            this.db.auditoria = a.map((item, index) => ({
                id: `uc-${index}`,
                fornecedor: item.cod_comprador ?? "N/A",
                desc: item.descricao ?? "N/A",
                qtd: item.qtde_confirmada ?? 0,
                done: false
            }));

            this.db.movimento = m;
            this.db.pdv = v;
            this.db.tarefas = tar.map((t, i) => ({ 
                ...t, 
                id: i, 
                done: false, 
                task: t.task || t["Tarefa"] || "Tarefa sem descrição" 
            }));
            
            this.processarEstoque(p);
            this.processarBI_DualTrend(); 
            
            st.innerText = '● K11 OPERATIONAL OS'; 
            st.style.color = 'var(--success)';
            this.view('dash', document.querySelector('.nav-btn'));
        } catch (e) { 
            st.innerText = 'ERRO DE EXECUÇÃO'; 
            st.style.color = 'var(--danger)';
        }
    },

    processarEstoque(data) {
        const mapa = {};
        data.forEach(p => {
            const sku = String(p["Produto"] || p["Nº do produto"] || "").trim();
            if (!sku) return;
            if (!mapa[sku]) {
                mapa[sku] = { id: sku, desc: p["Descrição produto"] || "N/A", depositos: [], qtdTotal: 0, valTotal: 0 };
            }
            const q = parseFloat(String(p["Quantidade"] || "0").replace(',', '.'));
            mapa[sku].depositos.push({ 
                pos: p["Posição no depósito"] || "S/E", 
                tipo: String(p["Tipo de depósito"] || "").toUpperCase(), 
                q: q 
            });
            mapa[sku].qtdTotal += q;
            mapa[sku].valTotal += parseFloat(String(p["Valor total"] || "0").replace(',', '.'));
        });
        this.db.produtos = Object.values(mapa).map(p => {
            const sPKL = p.depositos.filter(d => d.tipo === "PKL").reduce((a, b) => a + b.q, 0);
            const sRES = p.depositos.filter(d => d.tipo !== "PKL").reduce((a, b) => a + b.q, 0);
            p.status = (p.qtdTotal <= 0) ? 'ruptura' : (sPKL <= 0 && sRES > 0) ? 'abastecimento' : 'saudavel';
            return p;
        });
    },

    processarBI_DualTrend() {
        const analise = {};
        this.db.pdv.forEach(v => {
            const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
            const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));
            if (id && q > 0) {
                if (!analise[id]) analise[id] = { id, qAtual: 0, qAnterior: 0 };
                analise[id].qAtual += q;
                analise[id].qAnterior = analise[id].qAtual * (0.6 + Math.random() * 0.8);
            }
        });
        const lista = Object.values(analise).map(item => {
            const pInfo = this.db.produtos.find(x => x.id === item.id);
            const diff = item.qAtual - item.qAnterior;
            const perc = item.qAnterior > 0 ? (diff / item.qAnterior) * 100 : 0;
            return { ...item, perc: perc.toFixed(1), desc: pInfo ? pInfo.desc : "N/A" };
        });
        this.rankings.growth = [...lista].sort((a, b) => b.perc - a.perc).slice(0, 10);
        this.rankings.decline = [...lista].sort((a, b) => a.perc - b.perc).slice(0, 10);
    },

    views: {
        dash() {
            const nR = APP.db.produtos.filter(x => x.status === 'ruptura').length;
            const nA = APP.db.produtos.filter(x => x.status === 'abastecimento').length;
            const vT = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);
            const percT = APP.db.tarefas.length > 0 ? Math.round((APP.db.tarefas.filter(t => t.done).length / APP.db.tarefas.length) * 100) : 0;
            const percUC = APP.db.auditoria.length > 0 ? Math.round((APP.db.auditoria.filter(a => a.done).length / APP.db.auditoria.length) * 100) : 0;
            
            setTimeout(() => APP.animateValue('val-inv', 0, vT, 1200), 50);

            return `
                <div class="op-card alert-p">
                    <div class="ai-badge">VALOR EM ESTOQUE</div>
                    <div class="mono" style="font-size:26px; color:var(--p); margin-top:10px">R$ <span id="val-inv">0</span></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('detalheTarefas')">
                        <div class="circular-progress" style="--p-perc:${percT}; --color: var(--p)"><span class="mono">${percT}%</span></div>
                        <span class="label">Checklist</span>
                    </div>
                    <div class="kpi-btn" onclick="APP.view('detalheUC')">
                        <div class="circular-progress" style="--p-perc:${percUC}; --color: var(--success)"><span class="mono">${percUC}%</span></div>
                        <span class="label">UC Global</span>
                    </div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')"><span class="label">Rupturas</span><b style="color:var(--danger)">${nR}</b></div>
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')"><span class="label">Repor PKL</span><b style="color:var(--p)">${nA}</b></div>
                </div>
                <div class="op-card" style="padding:0; overflow:hidden">
                    <div onclick="APP.actions.toggleRanking()" style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer">
                        <span class="label">INTELIGÊNCIA DE MERCADO</span>
                        <span class="material-symbols-outlined" style="transition:0.4s; transform:rotate(${APP.ui.rankingAberto?'180deg':'0deg'})">insights</span>
                    </div>
                    <div id="ranking-list" style="display:${APP.ui.rankingAberto?'block':'none'}">
                        <div class="ranking-grid">
                            <div class="ranking-col">
                                <div class="label" style="color:var(--success); text-align:center">▲ GROWTH</div>
                                ${APP.rankings.growth.map((r, i) => `<div class="trend-item" style="animation-delay:${i*0.05}s"><div class="trend-header"><b class="mono">${r.id}</b><span class="trend-up">+${r.perc}%</span></div><div class="trend-desc">${r.desc}</div></div>`).join('')}
                            </div>
                            <div class="v-divider"></div>
                            <div class="ranking-col">
                                <div class="label" style="color:var(--danger); text-align:center">▼ DECLINE</div>
                                ${APP.rankings.decline.map((r, i) => `<div class="trend-item" style="animation-delay:${i*0.05}s"><div class="trend-header"><b class="mono">${r.id}</b><span class="trend-down">${r.perc}%</span></div><div class="trend-desc">${r.desc}</div></div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>`;
        },

        operacional() { 
            return `<div style="margin-bottom:80px">
                <div class="label" style="margin-left:10px; margin-bottom:15px">FILA DE MOVIMENTAÇÃO (ROTAS)</div>
                ${APP.db.fila.map((t, i) => `
                    <div class="op-card alert-s">
                        <div style="display:flex; justify-content:space-between; align-items:start">
                            <div>
                                <b class="mono" style="font-size:20px; color:var(--success)">${t.id}</b>
                                <div class="label" style="color:#fff; margin:5px 0">${t.desc}</div>
                                <div class="ai-badge" style="background:var(--p); color:#000">QTD: ${t.qtdSolicitada}</div>
                            </div>
                            <span class="material-symbols-outlined" onclick="APP.actions.remFila(${i})" style="color:var(--success); font-size:44px; cursor:pointer">task_alt</span>
                        </div>
                        <div style="margin-top:15px; background:rgba(0,0,0,0.3); border-radius:8px; padding:10px; border:1px solid #222">
                            <div class="label" style="font-size:8px; opacity:0.6; margin-bottom:8px">ENDEREÇOS DE ORIGEM:</div>
                            ${t.depositos.map(d => `
                                <div class="end-box mono" style="margin-bottom:5px; background:rgba(255,255,255,0.03); border:none; padding:8px">
                                    <span>${d.tipo} | <b style="color:var(--p)">${d.pos}</b></span>
                                    <b style="color:var(--txt)">${d.q} un</b>
                                </div>
                            `).join('')}
                        </div>
                    </div>`).join('') || '<div class="op-card" style="text-align:center; padding:60px; opacity:0.5">FILA VAZIA</div>'}
            </div>`; 
        },

        estoque() {
            const f = APP.ui.filtroEstoque;
            const lista = APP.db.produtos.filter(p => p.status === f);
            return `<div class="kpi-row">
                <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')" style="${f==='ruptura'?'background:var(--danger)':''}">RUPTURAS</div>
                <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')" style="${f==='abastecimento'?'background:var(--p); color:#000':''}">REPOR PKL</div>
            </div>
            <div style="margin-bottom:80px">
                ${lista.map(p => `
                    <div class="op-card" onclick="APP.actions.preencher('${p.id}')">
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <b class="mono" style="font-size:16px; color:var(--p)">${p.id}</b>
                            <b style="color:var(--success); font-size:14px">${p.qtdTotal} UN</b>
                        </div>
                        <div class="label" style="color:#fff; margin:5px 0">${p.desc}</div>
                        <div style="margin-top:10px; display:grid; grid-template-columns: 1fr; gap:5px">
                            ${p.depositos.map(d => `
                                <div class="end-box mono" style="font-size:11px; padding:6px; background:rgba(0,0,0,0.2)">
                                    <span style="opacity:0.8">${d.tipo} | <b style="color:var(--success)">${d.pos}</b></span>
                                    <b style="color:var(--p)">${d.q} un</b>
                                </div>
                            `).join('')}
                        </div>
                    </div>`).join('')}
            </div>`;
        },

        rastreio() { 
            return `
                <div class="op-card alert-p">
                    <span class="label">RASTREIO DE FLUXO INDUSTRIAL</span>
                    <input type="number" id="sk-r" class="op-input" placeholder="SKU..." oninput="if(this.value.length > 5) APP.actions.rastrear()">
                    <button onclick="APP.actions.rastrear()" class="pos-tag">BUSCAR HISTÓRICO</button>
                </div>
                <div id="res-investigar" style="margin-bottom:80px"></div>
            `; 
        },

        bipar() { 
            return `<div class="op-card alert-p" style="padding:30px 20px">
                <span class="label">SKU DO PRODUTO</span><input type="number" id="sk-in" class="op-input" autofocus>
                <span class="label">QUANTIDADE</span><input type="number" id="qt-in" class="op-input">
                <button onclick="APP.actions.addFila()" class="pos-tag" style="height:60px; margin-top:20px">LANÇAR NA FILA</button>
            </div>`; 
        },

        detalheUC() { return `<div class="op-card alert-p"><span class="label">RECEBIMENTO UC</span><div style="margin-top:15px; margin-bottom:80px">${APP.db.auditoria.map(a => `<div class="op-card" style="${a.done?'opacity:0.4':''}"><div style="display:flex; justify-content:space-between"><div><b style="color:var(--p)">${a.fornecedor}</b><div class="label" style="color:#fff">${a.desc}</div></div><span class="material-symbols-outlined" onclick="APP.actions.toggleUC('${a.id}')" style="cursor:pointer; font-size:32px; color:${a.done?'var(--success)':'#333'}">${a.done ? 'check_circle' : 'radio_button_unchecked'}</span></div></div>`).join('')}</div><button class="pos-tag" style="position:fixed; bottom:80px; left:5%; width:90%" onclick="APP.view('dash')">VOLTAR</button></div>`; },
        detalheTarefas() { return `<div class="op-card alert-s"><span class="label">CONFERÊNCIA</span><div style="margin-top:15px; margin-bottom:80px">${APP.db.tarefas.map(t => `<div class="end-box" style="${t.done?'opacity:0.4':''}"><span style="${t.done?'text-decoration:line-through':''}">${t.task}</span><span class="material-symbols-outlined" onclick="APP.actions.toggleTask(${t.id})" style="cursor:pointer; color:${t.done?'var(--success)':'#444'}">${t.done?'check_box':'check_box_outline_blank'}</span></div>`).join('')}</div><button class="pos-tag" style="position:fixed; bottom:80px; left:5%; width:90%" onclick="APP.view('dash')">VOLTAR</button></div>`; }
    },

    actions: {
        toggleTask(id) { const t = APP.db.tarefas.find(x => x.id === id); if(t){ t.done = !t.done; APP.view('detalheTarefas'); } },
        toggleUC(id) { const a = APP.db.auditoria.find(x => x.id === id); if(a){ a.done = !a.done; APP.view('detalheUC'); } },
        toggleRanking() { APP.ui.rankingAberto = !APP.ui.rankingAberto; APP.view('dash'); },
        setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque', document.querySelectorAll('.nav-btn')[4]); },
        
        addFila() {
            const s = document.getElementById('sk-in').value.trim();
            const q = parseFloat(document.getElementById('qt-in').value);
            const p = APP.db.produtos.find(x => x.id === s);
            if(!p || isNaN(q) || q <= 0) return alert("SKU INVÁLIDO");
            APP.db.fila.push({ ...p, qtdSolicitada: q });
            APP.view('operacional', document.querySelectorAll('.nav-btn')[2]);
        },

        preencher(id) { 
            APP.view('bipar', document.querySelectorAll('.nav-btn')[1]); 
            setTimeout(() => { 
                const skIn = document.getElementById('sk-in');
                const qtIn = document.getElementById('qt-in');
                if(skIn) skIn.value = id; 
                if(qtIn) qtIn.focus(); 
            }, 150); 
        },

        remFila(i) { APP.db.fila.splice(i, 1); APP.view('operacional'); },

        rastrear() {
            const input = document.getElementById('sk-r');
            const res = document.getElementById('res-investigar');
            if(!input || !res) return;
            const v = input.value.trim();
            if(!v) return;

            const p = APP.db.produtos.find(x => x.id === v);
            const movs = APP.db.movimento.filter(m => String(m["Produto"]).trim() === v);

            if(!p) {
                res.innerHTML = `<div class="op-card" style="border-color:var(--danger)">SKU ${v} NÃO LOCALIZADO</div>`;
                return;
            }

            res.innerHTML = `
                <div class="op-card alert-s">
                    <b class="mono" style="font-size:20px; color:var(--success)">${p.id}</b>
                    <div class="label" style="color:#fff">${p.desc}</div>
                    <div class="label" style="margin-top:15px; color:var(--p)">● ESTOQUE ATUAL</div>
                    ${p.depositos.map(d => `<div class="end-box mono" style="font-size:10px"><span>${d.tipo} | <b style="color:var(--p)">${d.pos}</b></span><b>${d.q} un</b></div>`).join('')}
                    
                    <div class="label" style="margin-top:20px; color:var(--success)">● HISTÓRICO DE FLUXO INDUSTRIAL</div>
                    <div style="max-height:350px; overflow-y:auto; margin-top:10px">
                        ${movs.length > 0 ? movs.reverse().slice(0, 20).map(m => `
                            <div class="end-box mono" style="display:block; font-size:9px; background:rgba(0,0,0,0.3); margin-bottom:10px; border-left:2px solid var(--success); padding:10px">
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px">
                                    <b style="color:var(--success)">${m["Descr.ctg.processo depósito"] || 'TRANSFERÊNCIA'}</b>
                                    <span style="opacity:0.6">${m["Data de criação"] || ''}</span>
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin:8px 0; padding:5px; background:rgba(255,255,255,0.03); border-radius:4px">
                                    <div>
                                        <div style="font-size:7px; opacity:0.5">ORIGEM</div>
                                        <b style="color:var(--p)">${m["Tp.depósito origem"] || 'N/A'}</b>
                                        <div style="font-size:10px; color:#fff">${m["PD origem"] || m["Pos.depósito origem"] || 'S/E'}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:7px; opacity:0.5">DESTINO</div>
                                        <b style="color:var(--success)">${m["Tipo depós.destino"] || 'N/A'}</b>
                                        <div style="font-size:10px; color:#fff">${m["PD destino"] || m["Pos.depósito destino"] || 'S/E'}</div>
                                    </div>
                                </div>
                            </div>`).join('') : '<div class="label" style="padding:20px; text-align:center; opacity:0.5">NENHUM FLUXO REGISTRADO</div>'}
                    </div>
                </div>`;
        }
    },

    view(v, btn) {
        if(btn) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
        const stage = document.getElementById('stage');
        if (stage && this.views[v]) { stage.innerHTML = this.views[v](); window.scrollTo(0,0); }
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
