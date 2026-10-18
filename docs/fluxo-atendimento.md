# Fluxo inicial de atendimento

Este fluxo e pensado para um MVP seguro: o bot ajuda, organiza e coleta dados, mas a loja confirma o pedido antes de cobrar ou prometer entrega.

## Entrada

Cliente envia qualquer mensagem para o WhatsApp da loja.

Bot responde:

> Oi! Sou o assistente da loja. Posso te ajudar a ver produtos, montar um pedido ou chamar uma pessoa do atendimento.

Opcoes:

1. Ver produtos
2. Fazer pedido
3. Entrega e retirada
4. Pagamento
5. Falar com atendente

## Ver produtos

Bot mostra categorias cadastradas quando houver mais de uma:

- Mais vendidos
- Novidades
- Promocoes
Ao selecionar uma categoria, o bot mostra os itens daquela categoria, com numero, nome, preco e uma descricao curta. O cliente tambem pode digitar o numero do produto diretamente se ja souber qual quer, ou digitar "categorias" para voltar a lista.

Produtos indisponiveis ou com estoque `0` nao aparecem para o cliente. Quando um produto tem estoque positivo configurado, o bot limita a quantidade solicitada a esse numero.
Depois que a loja confirma um pedido, a quantidade confirmada baixa do estoque configurado. Se a loja cancelar o pedido ou voltar para pendente, a quantidade e restaurada.

## Fazer pedido

Bot coleta:

1. Produto
2. Quantidade
3. Variacao, se existir
4. Nome do cliente
5. Contato capturado pelo WhatsApp ou pela sessao
6. Entrega ou retirada
7. Endereco, se for entrega
8. Forma de pagamento
9. Observacoes do cliente
10. Confirmacao do cliente antes de enviar para a loja

Depois, mostra o resumo para revisao:

> Resumo do pedido:
> Produto: ...
> Categoria: ...
> Quantidade: ...
> Contato: ...
> Entrega/retirada: ...
> Pagamento: ...
> Observacoes do cliente: ...
> Total estimado: ...
> Total estimado com frete: ... quando houver taxa estimada
>
> Confirme para enviar para a loja. Um atendente confirma disponibilidade, frete e pagamento.

O pedido so entra na fila depois que o cliente confirma. Antes disso, ele pode alterar observacoes ou cancelar.

## Chamar humano

O bot deve transferir para atendimento humano quando:

- Cliente pede desconto fora das regras.
- Cliente reclama ou demonstra irritacao.
- Pedido depende de estoque, producao personalizada ou prazo especial.
- Cliente pergunta algo que nao esta na base de conhecimento.
- Pagamento falha ou precisa de comprovante.

As regras ficam registradas na configuracao da loja, e as palavras configuradas em `handoffKeywords` tambem podem abrir atendimento humano automaticamente.

## Regras de seguranca

- Nao prometer estoque sem confirmacao.
- Nao prometer prazo exato sem regra cadastrada.
- Nao coletar dados sensiveis de cartao.
- Nao responder sobre assuntos fora da loja.
- Sempre deixar claro quando o pedido ainda depende de confirmacao.
