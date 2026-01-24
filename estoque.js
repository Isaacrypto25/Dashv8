function toggleColuna(header) {
  header.parentElement.classList.toggle('collapsed');
}

async function carregarEstoque() {
  const saudavelLista = document.getElementById('saudavelLista');
  const criticoLista = document.getElementById('criticoLista');
  const rupturaLista = document.getElementById('rupturaLista');

  const produtos = await window.api.buscarTodosProdutos();

  let saudavel = 0;
  let critico = 0;
  let ruptura = 0;

  produtos.forEach(produto => {
    const qtd = Number(produto.Quantidade) || 0;

    let lista;
    let status;

    if (qtd === 0) {
      lista = rupturaLista;
      status = 'Ruptura';
      ruptura++;
    } else if (qtd < 20) {
      lista = criticoLista;
      status = 'Crítico';
      critico++;
    } else {
      lista = saudavelLista;
      status = 'Saudável';
      saudavel++;
    }

    const item = document.createElement('div');
    item.className = 'item';

    item.innerHTML = `
      <strong>${produto.Produto}</strong>
      <small>${produto['Descrição produto'] || ''}</small>
      <small>Qtd: ${qtd}</small>
    `;

    lista.appendChild(item);
  });

  document.getElementById('saudavelQtd').innerText = saudavel;
  document.getElementById('criticoQtd').innerText = critico;
  document.getElementById('rupturaQtd').innerText = ruptura;
}

document.addEventListener('DOMContentLoaded', carregarEstoque);
