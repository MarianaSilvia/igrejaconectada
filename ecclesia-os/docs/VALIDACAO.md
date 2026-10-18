# Verificação da implementação

Verificado em 17 de outubro de 2026, no ambiente Windows local.

Suíte atual: `npm test` concluída com **66 testes aprovados e 0 falhas**, cobrindo RLS, financeiro, Pix, cadastro, foto protegida, fichas públicas, comunicação, Kids, ensino, ministérios, governança, portal, backup e restauração.

- `npm run build`: aprovado, incluindo verificação de tipos TypeScript e bundle Vite.
- `npm test`: 66 testes aprovados na execução integral, sem falhas.
- `scripts/browser-smoke.mjs`: aprovado em Chrome headless, com login e MFA, navegação de seis telas, temas Cosmos/Alvorada, A+ e viewport de 390 px sem overflow horizontal.
- Capturas inspecionadas: `.local/qa/dashboard-dark.png`, `.local/qa/dashboard-light.png` e `.local/qa/dashboard-mobile.png`.
- `npm run test:registration-browser`: aprovado em Chrome com banco temporário: geração de prévia local, formulário sem login, foto, congregação manual, envio, revisão, aprovação, edição posterior e cadastro manual. Inclui troca rápida entre dois destinos, liberando a resposta do primeiro somente depois do segundo, e preservação das anotações do destino escolhido. Layout de 390 px sem overflow horizontal.
- Capturas da ficha inspecionadas: `.local/qa/ficha-cadastro-desktop.png`, `.local/qa/ficha-cadastro-mobile.png` e `.local/qa/ficha-conferencia-secretaria.png`.
- `npm run test:evolution-browser`: aprovado em Chrome com banco temporário: convite privado aceito com MFA, solicitação financeira persistida em centavos, reserva de recurso e tarefa. Sem erros de página e sem overflow em 390 px nas três telas novas.
- Capturas da evolução: `.local/qa/evolucao-tarefas-desktop.png` e `.local/qa/evolucao-agenda-mobile.png`; a captura móvel foi inspecionada.

## Cenários automatizados

1. Valores monetários exatos e criptografia autenticada.
2. Autenticação e rejeição de escrita de outra origem.
3. Isolamento de leitura, gravação e referências entre igrejas.
4. Central somente com agregados; concessão de leitura e revogação imediata.
5. Prévia CSV, erros, possíveis duplicidades e confirmação de uso único.
6. Cobrança sem confirmação pelo cliente, divergências e recebimento idempotente.
7. Portal pessoal sem acesso à tesouraria.
8. Fechamento de período e reversões sem alteração do original.
9. Rejeição de inclusão tardia de linhas contábeis e lançamentos sem contrapartida.
10. Documentos privados e exclusão de dados pastorais do acesso central.
11. Isolamento de cadastro por campus.
12. Recuperação de cobrança expirada e devolução fictícia auditada.
13. Persistência local após encerramento de processo sem desligamento normal.
14. Bloqueio de módulos desabilitados e comprovantes sem identidade do contribuinte.
15. Restauração de backup em PostgreSQL novo, preservando dados e isolamento RLS.
16. Modelo de ficha, CPF e idade calculada.
17. Cadastro/edição pela secretaria, campos completos e foto privada normalizada sem metadados.
18. Rejeição de fotos inválidas, CPF inválido e gravações não autorizadas, sem cadastro parcial.
19. Geração de link local por secretaria e acesso ao formulário sem expor dados internos.
20. Recebimento pendente idempotente e rejeição de campos administrativos no endpoint público.
21. Aprovação única, incorporação da foto e edição posterior.
22. Atualização explícita de cadastro existente, sem duplicação nem perda de família/campus, com controle de versão.
23. Confirmação de leitura, responsável para menor e desafio assinado de envio.
24. Expiração e desativação de links preservando as fichas já analisadas.
25. Datas civis preservadas entre fusos e DATE serializado como YYYY-MM-DD no PostgreSQL embarcado.
26. Paginação de 221 fichas e pendência antiga fora dos 200 registros mais recentes.
27. Atribuição/revogação de células e limpeza de atribuições na troca de função, com encerramento de sessões.
28. Timeout ambíguo no provedor Pix, intenção persistida, consulta e recuperação pelo mesmo txid sem nova cobrança.
29. Aprovação independente, baixa parcial, repetição idempotente e estorno com saldo correto.
30. Conflito de reserva, rollback da série semanal e indisponibilidade do voluntário.
31. Tarefas com escopo e controle de versão.
32. Convites de uso único, persistência das tentativas inválidas de MFA e proteção de identidade já existente.
33. Criptografia dos segredos TOTP e recuperação por código de uso único.
34. Desligamento revoga sessões, desvincula tarefas e permite que outro responsável autorizado as assuma.

Os números acima agrupam cenários; a contagem do executor distingue testes individuais. Os resultados locais não confirmam concorrência no PostgreSQL externo, serviços Efí reais, certificação de acessibilidade ou prontidão de produção. O estado completo da entrega está em EVOLUCAO.md.

## Demonstração atualizada

Migrações 009–012 aplicadas na demonstração local após preservar `.local/backups/antes-evolucao-20261016-162224.snapshot`. A inicialização terminou sem erro. `/api/health` retornou 200/demo e o link de cadastro anterior continuou retornando 200. Os testes de navegador geral, evolutivo e de cadastro foram executados com Chrome headless: login/MFA, seis páginas, temas claro/escuro, modo sênior, tarefas, reservas, ficha pública anônima com foto, congregação digitada, aprovação da secretaria, edição do perfil, cadastro manual e layout de 390 px.

## Limites desta evidência

Não foram testados credenciais/certificados reais da Efí, callback mTLS público, PostgreSQL externo, Docker, hardware Kids, carga, leitor de tela ou conformidade WCAG completa. Os resultados não autorizam produção. O roteiro para homologação e lançamento está em OPERACAO.md.

