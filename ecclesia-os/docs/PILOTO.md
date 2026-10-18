# Roteiro do piloto EcclesiaOS

Este roteiro separa a demonstração local da homologação com dados de teste. O piloto só avança para pagamentos e operação presencial depois que cada etapa estiver registrada.

## 1. Preparar o ambiente

1. Configure `APP_MODE=homologation` e um `PUBLIC_ORIGIN` HTTPS.
2. Crie dois logins PostgreSQL distintos: `DATABASE_URL` para `ecclesia_app` e `SERVICE_DATABASE_URL` para `ecclesia_service`. O login da aplicação não pode ser superusuário, proprietário das tabelas, `BYPASSRLS` ou membro do papel de serviço.
3. Gere `DATA_KEY_HEX` e `MFA_KEY_HEX` com 32 bytes aleatórios, mantendo-os distintos no gerenciador de segredos.
4. Configure a conta Efí de homologação e os certificados mTLS exigidos pelo callback.
5. Configure, se necessário, os webhooks de e-mail e SMS com URLs HTTPS e tokens separados.

Execute:

```powershell
npm run pilot:preflight
npm run db:migrate
```

O preflight precisa retornar `ok: true`. Ele não imprime valores secretos. Se retornar `false`, corrija os itens indicados antes de iniciar o servidor.

## 2. Validar a base

```powershell
npm test
npm run build
npm run test:postgres
```

O teste PostgreSQL só deve ser executado com os dois bancos externos configurados. Ele verifica papéis distintos, leitura e escrita entre duas igrejas, documentos, comunicações e solicitações de privacidade.

## 3. Validar a operação no navegador

Defina `PLAYWRIGHT_MODULE` para o Playwright distribuído com o ambiente e `PLAYWRIGHT_EXECUTABLE_PATH` para o Chrome instalado. Com o servidor local em execução:

```powershell
npm run test:browser
npm run test:evolution-browser
npm run test:registration-browser
```

Registre o resultado com data, versão, navegador e tamanho de tela. O fluxo deve incluir login com MFA, cadastro público, aprovação pela secretaria, visão integrada do membro, células, financeiro, portal e navegação em celular.

O fluxo de evolução também abre `/catalogo/:churchId` sem autenticação, verifica o nome da igreja e o título do catálogo, e confirma a ausência de overflow horizontal em 390px.

## 4. Cenários do piloto

- Cadastre duas igrejas e confirme que nenhuma tela, exportação, foto, documento ou relatório atravessa o limite da igreja.
- Crie uma ficha pública com foto, revise duplicidades e aprove-a pela secretaria.
- Faça uma inscrição com capacidade esgotada e confirme a lista de espera.
- Inicie um workflow de visitante, reatribua o responsável e conclua a tarefa.
- Registre um pedido de oração com responsável, altere a situação e confirme a tarefa pastoral.
- Faça uma cobrança Pix de homologação, repita uma notificação e confirme que o lançamento não duplica.
- Teste check-in Kids, token de retirada e uma exceção de responsável autorizado.
- Restaure um backup em uma instalação separada e confirme que os dados criptografados podem ser lidos com a chave correta.

## 5. Liberação

Arquive os resultados, falhas, tempos de execução, divergências financeiras e chamados de suporte. O piloto só pode receber dados reais depois de o preflight, os testes externos, a restauração e a validação presencial das impressoras Zebra/Brother estarem aprovados. Efí real, provedor de comunicação, domínio público e cobrança SaaS continuam etapas posteriores à homologação.
