# Política de Privacidade — Cineou (RASCUNHO)

> **Rascunho técnico, não é texto jurídico final.** Escrito a partir do que o código realmente coleta e faz.
> Precisa de revisão por profissional de direito antes do beta. Campos entre colchetes precisam ser preenchidos pelo responsável.

**Controlador:** [nome completo ou razão social] · **Contato para privacidade:** [e-mail]
**Vigência:** [data]

## 1. Quais dados coletamos

| Dado | Origem | Para quê |
|---|---|---|
| E-mail e senha (a senha é armazenada só como hash pelo provedor de autenticação) | você, no cadastro | criar e proteger sua conta |
| Gêneros que você gosta, não gosta e quer evitar; filmes favoritos; limites (duração, nota, idioma) | você, no onboarding e no perfil | recomendar filmes |
| Filmes que você salvou, assistiu, avaliou ou marcou como sem interesse, e os motivos que escolheu | você, ao usar o app | aprender seu gosto e não repetir filmes |
| Recomendações exibidas, com a pontuação, os motivos calculados e o seu feedback | geradas pelo app | medir e melhorar a qualidade das recomendações |
| Frequência, dia, horário e fuso horário da recomendação programada | você, no perfil | gerar a recomendação no momento certo |

Não coletamos: nome, telefone, endereço, dados de pagamento, localização precisa, contatos ou histórico dos serviços de streaming.
O app não usa cookies de publicidade nem ferramentas de rastreamento de terceiros. As fontes tipográficas são servidas pelo próprio app.

## 2. Bases legais (LGPD, art. 7º)

- Execução do serviço que você contratou ao criar a conta (art. 7º, V): conta, preferências, recomendações.
- Legítimo interesse (art. 7º, IX): métricas agregadas de qualidade do algoritmo e prevenção de abuso.
[Revisar com profissional de direito.]

## 3. Com quem os dados são compartilhados

Operadores que processam dados em nosso nome:
- **Supabase** — banco de dados, autenticação e execução do backend. [Confirmar região do projeto e cláusulas de transferência internacional.]
- **Vercel** — hospedagem do site.
- **TMDB (The Movie Database)** — os pôsteres e imagens são carregados direto dos servidores do TMDB; ao exibi-los, seu navegador envia ao TMDB o endereço IP e dados técnicos da requisição. Nenhum dado da sua conta é enviado ao TMDB.
- **GitHub** — cópia de segurança semanal, criptografada.

Não vendemos dados e não compartilhamos para publicidade.

## 4. Por quanto tempo guardamos

- Enquanto sua conta existir.
- Ao apagar a conta, todos os dados vinculados são removidos imediatamente do banco principal.
- Cópias de segurança criptografadas (backups) ficam guardadas por até 30 dias e depois são descartadas automaticamente; uma conta apagada some delas nesse prazo.
- Logs técnicos das funções do servidor (usados para investigar erros) guardam o identificador interno da sua conta — nunca o e-mail ou suas listas — por [prazo de retenção de logs do provedor — NÃO VERIFICADO], e depois são apagados pelo provedor.

## 5. Seus direitos (LGPD, art. 18)

No próprio app, em **Perfil → Conta e privacidade**, você pode:
- **exportar** todos os seus dados (arquivo JSON);
- **apagar** sua conta e todos os dados vinculados;
- **corrigir** preferências a qualquer momento.

Para os demais direitos (confirmação de tratamento, informações sobre compartilhamento, revisão etc.), escreva para [e-mail].

## 6. Segurança

- Cada usuário só acessa os próprios dados (Row Level Security no banco).
- Conexões criptografadas (HTTPS).
- Chaves de acesso privilegiado nunca ficam no navegador.
- Backups criptografados.

## 7. Menores de idade

[Definir idade mínima.]

## 8. Alterações

Mudanças relevantes serão avisadas no app antes de entrarem em vigor.
