async function buscar() {
  const inputCodigo = document.getElementById('codigo');
  const codigo = inputCodigo.value.trim();
  const resultado = document.getElementById('resultado');

  resultado.innerHTML = '';

  if (!codigo) {
    resultado.innerHTML = '<p class="erro">Informe um código.</p>';
    return;
  }

  // Agora esperamos UMA LISTA de registros
  const produtos = await window.api.buscarProduto(codigo);

  if (!produtos || produtos.length === 0) {
    resultado.innerHTML = '<p class="erro">Produto não encontrado.</p>';
    return;
  }

  const card = document.createElement('div');
  card.className = 'produto-card';

  // Cabeçalho do produto
  const titulo = document.createElement('h3');
  titulo.textContent = produtos[0]['Descrição produto'] || 'Produto encontrado';
  card.appendChild(titulo);

  // Tabela
  const tabela = document.createElement('table');
  tabela.className = 'tabela-produto';

  // Campos fixos que queremos destacar
  const camposBase = ['Produto', 'Descrição produto'];

  camposBase.forEach(campo => {
    if (produtos[0][campo]) {
      const linha = document.createElement('tr');
      linha.innerHTML = `<td>${campo}</td><td>${produtos[0][campo]}</td>`;
      tabela.appendChild(linha);
    }
  });

  // Separador visual
  const separador = document.createElement('tr');
  separador.innerHTML = `<td colspan="2"><strong>Depósitos</strong></td>`;
  tabela.appendChild(separador);

  // Agora listamos TODOS os depósitos
  produtos.forEach(p => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td>${p['Tipo de depósito']}</td>
      <td>Qtd: ${p['Quantidade']}</td>
    `;
    tabela.appendChild(linha);
  });

  card.appendChild(tabela);
  resultado.appendChild(card);

  inputCodigo.value = '';
  inputCodigo.focus();
}

// Logout
function logout() {
  window.location.href = 'index.html';
}

// Enter automático (leitor)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('codigo').addEventListener('keydown', e => {
    if (e.key === 'Enter') buscar();
  });
});
