# Auditoria comparativa de autenticação

Data: 19 de outubro de 2026

## Igreja Conectada

Repositório analisado: [MarianaSilvia/igrejaconectada](https://github.com/MarianaSilvia/igrejaconectada).

A autenticação observada usa o Supabase Auth como origem única:

- o cliente cria a sessão com `signInWithPassword`;
- o logout chama `supabase.auth.signOut()`;
- a sessão atual é recuperada pelo cliente e o token é enviado ao backend em `Authorization: Bearer`;
- o acesso é validado pelo status aprovado e pelos metadados do usuário;
- os papéis locais são convertidos em permissões de módulos;
- o acesso por código de membro usa uma rota própria, que devolve tokens ao cliente apenas após validar o código e a senha;
- a aplicação limpa o estado privado local quando a sessão termina.

O projeto também tem uma política explícita de módulos por papel: administrador, secretário, tesoureiro, líder, professor e membro. Isso é uma boa referência de organização de interface, mas as permissões do EcclesiaOS continuarão sendo verificadas no servidor e no banco, porque esconder módulos no navegador não é controle de segurança.

## Decisão para o EcclesiaOS

O EcclesiaOS já possui autenticação própria com senha temporária, troca obrigatória, sessões revogáveis e MFA. A migração imediata para Supabase Auth não é necessária para remover a falha atual e aumentaria o risco de migrar usuários, sessões e políticas RLS durante o piloto.

A implementação adotada nesta rodada é:

1. manter uma única origem de autenticação no backend do EcclesiaOS;
2. usar cookie de sessão `HttpOnly`, `Secure`, `SameSite` e `Path=/`;
3. retornar mensagens genéricas para credenciais inválidas;
4. exigir troca de senha temporária e MFA para funções administrativas;
5. aplicar o escopo por `church_id`, rede, campus e papel no servidor;
6. revogar sessões imediatamente quando o usuário for desativado ou quando houver logout administrativo;
7. manter o membro limitado ao portal e ao próprio escopo;
8. deixar a área comercial desativada por feature flag no piloto.

A integração futura com Supabase Auth só deve ser avaliada depois de testes de compatibilidade com MFA, recuperação, revogação, RLS e migração de usuários.

## Limitação da comparação

A análise foi feita no repositório GitHub público informado. Não foram copiados código, banco, chaves, sessões ou dados do Igreja Conectada.
