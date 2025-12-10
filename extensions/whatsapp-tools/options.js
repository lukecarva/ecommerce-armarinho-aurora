const PAINEL_DEFAULT = 'https://painel.armarinhoaurora.com.br';

const inputUrl = document.getElementById('painelUrl');
const btnSalvar = document.getElementById('salvar');
const divStatus = document.getElementById('status');

chrome.storage.sync.get({ painelUrl: PAINEL_DEFAULT }, (s) => {
  const url =
    s.painelUrl && !s.painelUrl.includes('homolog') && !s.painelUrl.includes('/painel')
      ? s.painelUrl
      : PAINEL_DEFAULT;
  if (url !== s.painelUrl) chrome.storage.sync.set({ painelUrl: url });
  inputUrl.value = url;
});

btnSalvar.addEventListener('click', () => {
  const val = inputUrl.value.trim().replace(/\/$/, '');
  if (!val) {
    divStatus.textContent = 'URL não pode estar vazia.';
    divStatus.style.color = '#dc2626';
    return;
  }
  chrome.storage.sync.set({ painelUrl: val }, () => {
    divStatus.textContent = 'Salvo!';
    divStatus.style.color = '#16a34a';
    setTimeout(() => {
      divStatus.textContent = '';
    }, 2000);
  });
});
