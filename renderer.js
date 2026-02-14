/**
 * K11 OPERATIONAL OS - OMNI ELITE 2026
 * STATUS: ÍNTEGRO / COMPLETO
 * FOCO: Rastreabilidade de Fluxo DPA (HIDRAULICA)
 */

const APP = {
    db: { 
        produtos: [], movimento: [], pdv: [], pdvExtra: {}, tarefas: [], ucGlobal: [] 
    },
    rankings: { 
        growth: [], decline: [], duelos: [], 
        meta: { lossGap: "0.0", desvio: "0.0" } 
    },
    ui: { rankingAberto: false, filtroEstoque: 'ruptura', pdvAlvo: 'mesquita', buscaDuelo: '' },
    CAPACIDADE_PADRAO: 50, 

    async init() {
        const st = document.getElementById('engine-status');
        try {
            const t = Date.now();
            const fetchJSON = async (url) => {
                const r = await fetch(url);
                return r.ok ? await r.json() : [];
            };

            // Carga Massiva de Dados
            const [p, m, v, tar, vM, vJ, vB] = await Promise.all([
                fetchJSON(`./produtos.json?t=${t}`),
                fetchJSON(`./movimento.json?t=${t}`),
                fetchJSON(`./pdv.json?t=${t}`),
                fetchJSON(`./tarefas.json?t=${t}`),
                fetchJSON(`./pdvmesquita.json?t=${t}`),
                fetchJSON(`./pdvjacarepagua.json?t=${t}`),
                fetchJSON(`./pdvbenfica.json?t=${t}`)
            ]);
            
            this.db.produtos = p;
            this.db.movimento = m;
            this.db.pdv = v;
            this.db.pdvExtra = { mesquita: vM, jacarepagua: vJ, benfica: vB };
            this.db.tarefas = tar.map((t, i) => ({ ...t, id: i, done: false }));
            
            // Motores de Processamento
            this.processarEstoque(p);
            this.processarUCGlobal_DPA(); 
            this.processarDueloAqua(); 
            
            st.innerText = '● K11 OMNI ONLINE'; 
            st.style.color = '#28a745';
            this.view('dash', document.querySelector('.nav-btn'));
        } catch (e) { 
            st.innerText = 'ERRO SINCRO'; 
            console.error("Critical Failure:", e); 
        }
    },

    processarEstoque(data) {
        const mapa = {};
        data.forEach(p => {
            const sku = String(p["Produto"] || p["Nº do produto"] || "").trim();
            if (!sku) return;
            if (!mapa[sku]) mapa[sku] = { id: sku, desc: p["Descrição produto"] || "N/A", depositos: [], qtdTotal: 0, valTotal: 0 };
            
            const q = parseFloat(String(p["Quantidade"] || "0").replace(',', '.'));
            mapa[sku].depositos.push({ 
                pos: p["Posição no depósito"] || p["Posição"] || "S/E", 
                tipo: String(p["Tipo de depósito"] || p["Tipo"] || "").toUpperCase(), 
                q: q 
            });
            mapa[sku].qtdTotal += q;
            mapa[sku].valTotal += parseFloat(String(p["Valor total"] || "0").replace(',', '.'));
        });
        this.db.produtos = Object.values(mapa).map(p => {
            const sPKL = p.depositos.filter(d => d.tipo === "PKL").reduce((a, b) => a + b.q, 0);
            const sRES = p.depositos.filter(d => d.tipo !== "PKL" && d.tipo !== "DPA").reduce((a, b) => a + b.q, 0);
            p.status = (p.qtdTotal <= 0) ? 'ruptura' : (sPKL <= 0 && sRES > 0) ? 'abastecimento' : 'saudavel';
            return p;
        });
    },

    processarUCGlobal_DPA() {
        const pendencias = [];
        const mapaUltimoEstado = new Map();

        // Ordenamos o movimento para garantir que o último registro processado seja o mais recente
        // Assumindo que o JSON venha em ordem cronológica. Se não, precisaríamos dar um sort por data/hora.
        this.db.movimento.forEach(m => {
            const sku = String(m["Produto"]).trim();
            if (sku) {
                mapaUltimoEstado.set(sku, m);
            }
        });

        mapaUltimoEstado.forEach((ultimoMov, sku) => {
            // Chaves do seu JSON: "Tipo depós.destino" e "PD destino"
            const tipoDestino = String(ultimoMov["Tipo depós.destino"] || "").toUpperCase();
            const pdDestino = String(ultimoMov["PD destino"] || "").toUpperCase();

            // Se o último destino foi DPA ou HIDRAULICA, ele está "preso" lá
            if (tipoDestino === "DPA" || pdDestino === "HIDRAULICA") {
                const infoProd = this.db.produtos.find(p => p.id === sku);
                
                pendencias.push({
                    id: sku,
                    desc: ultimoMov["Descrição produto"] || (infoProd ? infoProd.desc : "N/A"),
                    qtd: ultimoMov["Qtd.real destino UMB"] || ultimoMov["Qtd.prev.orig.UMA"] || "S/Q",
                    data: ultimoMov["Data da confirmação"] || ultimoMov["Data de criação"],
                    tarefa: ultimoMov["Tarefa de depósito"] || ultimoMov["Ordem de depósito"],
                    posDPA: pdDestino,
                    // Cruzamento com estoque real (se houver) para ver onde cabe
                    estoqueFixo: infoProd ? infoProd.depositos.filter(d => d.tipo !== "DPA") : []
                });
            }
        });

        this.db.ucGlobal = pendencias;
    },

    processarDueloAqua() {
        const keywords = ['BOMBA', 'PISCINA', 'CLORO', 'FILTRO', 'MOTOBOMBA'];
        const baseAlvo = this.db.pdvExtra[this.ui.pdvAlvo] || [];
        const mapaAlvo = new Map();
        const minhaLoja = new Map();

        baseAlvo.forEach(v => {
            const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
            const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));
            mapaAlvo.set(id, (mapaAlvo.get(id) || 0) + q);
        });

        this.db.pdv.forEach(v => {
            const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
            const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));
            minhaLoja.set(id, (minhaLoja.get(id) || 0) + q);
        });

        let somaLoss = 0, total = 0;
        const comp = [];
        this.db.produtos.forEach(p => {
            if (!keywords.some(k => p.desc.toUpperCase().includes(k))) return;
            const vA = mapaAlvo.get(p.id) || 0;
            const vM = minhaLoja.get(p.id) || 0;
            const loss = vA > 0 ? (100 - ((vM / vA) * 100)) : 0;
            if (vA > 0 || vM > 0) { 
                comp.push({ id: p.id, desc: p.desc, vA, vM, loss: loss.toFixed(1) }); 
                somaLoss += loss; total++; 
            }
        });
        this.rankings.duelos = comp;
        this.rankings.meta.lossGap = (somaLoss / (total || 1)).toFixed(1);
    },

    view(v, btn) {
        if(btn) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
        const stage = document.getElementById('stage');
        if (stage && APP.views[v]) { stage.innerHTML = APP.views[v](); window.scrollTo(0,0); }
    },

    views: {
        dash() {
            const countUC = APP.db.ucGlobal.length;
            return `
                <div class="op-card alert-p" style="text-align:center">
                    <div class="label">K11 OPERATIONAL OS</div>
                    <div class="mono" style="font-size:22px; margin-top:10px; color:var(--primary)">SISTEMA DE FLUXO ATIVO</div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.view('detalheUC')" style="border: 2px solid ${countUC > 0 ? 'var(--danger)' : '#eee'}">
                        <div class="circular-progress" style="--p-perc:${countUC > 0 ? 100 : 0}; --color: var(--danger)"><span>${countUC}</span></div>
                        <span class="label">UC GLOBAL (DPA)</span>
                    </div>
                    <div class="kpi-btn" onclick="APP.view('projetor')">
                        <span class="label">LOSS GAP</span>
                        <b style="color:var(--danger); font-size:18px">${APP.rankings.meta.lossGap}%</b>
                    </div>
                </div>
                <div class="kpi-row">
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('ruptura')">
                        <span class="label">RUPTURAS</span>
                        <b style="color:var(--danger)">${APP.db.produtos.filter(x => x.status==='ruptura').length}</b>
                    </div>
                    <div class="kpi-btn" onclick="APP.actions.setFiltroEstoque('abastecimento')">
                        <span class="label">REPOSIÇÃO</span>
                        <b style="color:var(--primary)">${APP.db.produtos.filter(x => x.status==='abastecimento').length}</b>
                    </div>
                </div>`;
        },

        detalheUC() {
            return `
                <div class="op-card alert-p">
                    <span class="label">GARGALOS IDENTIFICADOS NO DPA (MOVIMENTO.JSON)</span>
                    <div style="margin-top:15px; margin-bottom:80px">
                        ${APP.db.ucGlobal.map(item => `
                            <div class="op-card" style="border-left: 5px solid var(--danger); margin: 10px 0; background:#fff">
                                <div style="display:flex; justify-content:space-between">
                                    <b class="mono" style="font-size:16px">${item.id}</b>
                                    <span style="color:var(--danger); font-size:10px; font-weight:bold">AGUARDANDO SAÍDA</span>
                                </div>
                                <div style="font-size:12px; margin: 8px 0; color:#333"><b>${item.desc}</b></div>
                                <div class="end-box" style="font-size:10px; background:#fef2f2; border:1px solid #fecaca">
                                    <b>Tarefa:</b> ${item.tarefa} | <b>Data:</b> ${item.data}<br>
                                    <b>Posição:</b> ${item.posDPA} | <b>Qtd:</b> ${item.qtd}
                                </div>
                                <div class="label" style="margin-top:10px; font-size:8px">LOCAIS DE DESTINO POSSÍVEIS:</div>
                                ${item.estoqueFixo.map(l => `<div style="font-size:10px; color:#666">● ${l.pos} (${l.tipo}): <b>${l.q} un</b></div>`).join('') || '<span style="font-size:10px;color:red">Sem posição fixa cadastrada</span>'}
                                <button class="pos-tag" style="margin-top:10px; width:100%; height:40px" onclick="APP.actions.preencher('${item.id}')">TRANSFERIR PARA PICKING</button>
                            </div>
                        `).join('') || '<div style="text-align:center; padding:40px; opacity:0.5">NENHUM ITEM PRESO NO DPA</div>'}
                    </div>
                    <button class="pos-tag" style="position:fixed; bottom:80px; left:5%; width:90%; background:var(--secondary)" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        operacional() {
            return `
                <div class="op-card alert-s">
                    <span class="label">MOVIMENTAÇÃO INTERNA</span>
                    <input type="number" id="sk-in" class="op-input" placeholder="SKU">
                    <input type="number" id="qt-in" class="op-input" placeholder="QUANTIDADE">
                    <button class="pos-tag" style="width:100%" onclick="APP.actions.addFila()">ADICIONAR À FILA</button>
                </div>
                <div style="margin-bottom:80px">
                    ${APP.db.fila.map((f, i) => `
                        <div class="op-card" style="display:flex; justify-content:space-between; align-items:center">
                            <div><b>${f.id}</b><br><small>${f.desc}</small><br><b>QTD: ${f.qtdSolicitada}</b></div>
                            <button onclick="APP.actions.remFila(${i})" style="background:none; border:none; color:var(--danger); font-weight:bold">REMOVER</button>
                        </div>
                    `).join('')}
                </div>`;
        },

        estoque() {
            const lista = APP.db.produtos.filter(p => p.status === APP.ui.filtroEstoque);
            return `<div style="margin-bottom:80px">${lista.map(p => `<div class="op-card" onclick="APP.actions.preencher('${p.id}')"><b>${p.id}</b> - ${p.desc}<br>${p.depositos.map(d => `<div class="end-box">${d.pos}: ${d.q}</div>`).join('')}</div>`).join('')}</div>`;
        },
        projetor() {
            return `<div class="op-card"><span class="label">BI - LOSS GAP</span><div style="margin-top:10px">${APP.rankings.duelos.map(d => `<div class="end-box"><b>${d.id}</b>: Loss ${d.loss}%</div>`).join('')}</div></div>`;
        }
    },

    actions: {
        setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },
        addFila() {
            const s = document.getElementById('sk-in').value;
            const q = document.getElementById('qt-in').value;
            const p = APP.db.produtos.find(x => x.id === s) || { id: s, desc: "Item S/ Cadastro" };
            if(s) { APP.db.fila.push({...p, qtdSolicitada: q}); APP.view('operacional'); }
        },
        remFila(i) { APP.db.fila.splice(i, 1); APP.view('operacional'); },
        preencher(id) { 
            APP.view('operacional'); 
            setTimeout(() => { document.getElementById('sk-in').value = id; document.getElementById('qt-in').focus(); }, 150); 
        }
    }
};

window.onload = () => APP.init();
