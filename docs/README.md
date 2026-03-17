# Site de Download do APK

Pasta do projeto:
`C:\Users\Carlos Eduardo\agora vai\site-download-apk`

## Como usar

1. Coloque o arquivo APK em:
`downloads/universo-real-latest.apk`

2. Edite o arquivo `config.json` para atualizar:
- `version`
- `releaseDate`
- `whatsNew`
- `apkUrl` (se mudar o nome/arquivo)

3. Publique esta pasta em qualquer hospedagem estatica:
- Netlify
- Vercel
- GitHub Pages
- Hostinger

## Teste local

No PowerShell, dentro da pasta do projeto:

```powershell
cd "C:\Users\Carlos Eduardo\agora vai\site-download-apk"
python -m http.server 8080
```

Depois abra:
`http://localhost:8080`

## Fluxo para os usuarios

1. Entram no link do site
2. Tocam em **Baixar APK**
3. Instalam no Android
