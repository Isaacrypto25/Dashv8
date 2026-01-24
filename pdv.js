const PDVManager = {
    gerarTela(vendas) {
        if (!vendas || vendas.length === 0) {
            return `<h2>PDV</h2><div class="card-unificado">Sem dados de vendas.</div>`;
        }

        let totalItens = 0;
        const resumoSub = {};
        const resumoProd = {};

        vendas.forEach(v => {
            const sub = v["Denominação da subseção"] || "OUTROS";
            const nomeProd = v["Texto breve material"] || "Produto sem nome";
            const qtd = parseInt(v["Quantidade vendida"]) || 0;
            
            totalItens += qtd;

            // Agrupa por Subseção
            resumoSub[sub] = (resumoSub[sub] || 0) + qtd;

            // Agrupa por Produto
            if (!resumoProd[nomeProd]) {
                resumoProd[nomeProd] = { qtd: 0, sku: v["Nº do produto"] };
            }
            resumoProd[nomeProd].qtd += qtd;
        });

        const rankingSub = Object.entries(resumoSub).sort((a, b) => b[1] - a[1]);
        const rankingProd = Object.entries(resumoProd).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 5); // Pega o Top 5

        return `
            <h2>Inteligência de Vendas</h2>
            
            <div class="card-unificado dash-card main">
                <small>VOLUME TOTAL DE SAÍDA</small>
                <h3>${totalItens} Unidades</h3>
                <span class="material-symbols-outlined icon-bg">trending_up</span>
            </div>

            <h3 style="margin:20px 0 10px 0; font-size:14px">🏆 Top 5 Produtos Mais Vendidos</h3>
            <div class="lista-top-produtos">
                ${rankingProd.map(([nome, dados], i) => `
                    <div class="card-unificado" style="margin-bottom:8px; display:flex; align-items:center; gap:10px; padding: 10px;">
                        <div class="medalha rank-${i+1}">${i+1}º</div>
                        <div style="flex:1">
                            <b style="font-size:11px; display:block">${nome}</b>
                            <small style="opacity:0.6">SKU: ${dados.sku}</small>
                        </div>
                        <div style="text-align:right">
                            <b style="color:var(--primary)">${dados.qtd}</b><br>
                            <small style="font-size:9px">un</small>
                        </div>
                    </div>
                `).join('')}
            </div>

            <h3 style="margin:20px 0 10px 0; font-size:14px">Market Share por Subseção</h3>
            ${rankingSub.map(([nome, qtd]) => {
                const perc = ((qtd / totalItens) * 100).toFixed(1);
                return `
                    <div class="sub-item-glass">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:11px">
                            <b>${nome}</b>
                            <span>${qtd} un (${perc}%)</span>
                        </div>
                        <div class="progress-bg"><div class="progress-bar" style="width:${perc}%"></div></div>
                    </div>
                `;
            }).join('')}
        `;
    }
};
