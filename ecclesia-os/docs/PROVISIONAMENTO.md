# Provisionamento inicial

A estrutura do Supabase já está publicada. O primeiro provisionamento cria uma rede, uma região, uma igreja sede, o campus inicial, o administrador e as contas financeiras básicas.

O script aceita somente um arquivo JSON local e privado. Não envie esse arquivo, senha ou segredo MFA pelo chat e não o versiona no Git.

## Dados necessários

- `network`: nome da rede ou denominação;
- `region`: nome da região administrativa;
- `church`: nome da igreja sede;
- `name`: nome do administrador;
- `email`: e-mail de acesso;
- `password`: senha com pelo menos 14 caracteres;
- `totpSecret`: segredo Base32 de 32 caracteres para MFA.

## Execução no ambiente de homologação

Crie o arquivo dentro de `.local`, que não é versionado:

```powershell
$configPath = Join-Path (Get-Location) '.local\provisioning.json'
New-Item -ItemType Directory -Force (Split-Path $configPath) | Out-Null
notepad $configPath
```

Preencha o JSON localmente:

```json
{
  "network": "Nome da rede",
  "region": "Região principal",
  "church": "Igreja sede",
  "name": "Administrador",
  "email": "admin@exemplo.org",
  "password": "uma-senha-local-com-14-caracteres",
  "totpSecret": "ABCDEFGHIJKLMNOPQRSTUVWX234567AB"
}
```

Com `APP_MODE=homologation` e as três URLs PostgreSQL configuradas, execute:

```powershell
npm run provision -- .local\provisioning.json
```

O comando é idempotente por segurança: se já existir um usuário, ele interrompe e não cria uma segunda instalação. Depois de confirmar o acesso, remova o arquivo:

```powershell
Remove-Item -LiteralPath .local\provisioning.json -Force
```

A senha e o segredo MFA devem ser armazenados no gerenciador de senhas da implantação. O próximo passo após o provisionamento é cadastrar as congregações e executar o teste de isolamento entre duas igrejas.
