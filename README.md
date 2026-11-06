# Nolol Maamul

Website-ka maamulka nolosha maalinta ah. Wuxuu ku caawiyaa:

- **Lacagta (Wallet)**: wallet-yada (lacag gacan, bangi, mobile money, kaydka), dakhliga iyo kharashka, iyo qaybaha kharashka.
- **Jadwalka**: hawlaha, waqtiyada iyo muhiimadda.
- **Wardiga**: qorista wardiga maalinlaha ah iyo mood-ka.
- **Dashboard**: wadarta lacagta, dakhliga/kharashka bishan, jadwalka soo socda iyo wardiga ugu dambeeyay.
- **Maamulka (Admin)**: isticmaalayaasha oo la abuuri karo, doorarka la beddeli karo, akoonada la joojin karo ama la tirtiri karo, iyo tirakoobka guud.

## Qaab-dhismeedka

```
nolol-maamul/
├── server.js          # Backend (Node.js, API + static files)
├── package.json
├── data/
│   └── db.json        # Xogta (si toos ah ayaa loo abuuraa marka ugu horreysa)
└── public/            # Frontend
    ├── index.html
    ├── styles.css
    └── app.js
```

Backend-ka ma isticmaalo package dibadeed (npm install looma baahna). Wuxuu isticmaalaa modules-ka Node.js ee dhismaha ah.

## Bilow

Ku rakib **Node.js 18** ama ka cusub, kadibna:

```bash
cd nolol-maamul
node server.js
```

Ka fur browser-ka: <http://localhost:3000>

Port kale ayaad rabtaa?

```bash
PORT=8080 node server.js
```

## Admin-ka ugu horreeya

Isticmaalaha **ugu horreeya ee diiwaan gelaya** wuxuu noqonayaa admin toos ah. Ka dib, admin-ku wuxuu isticmaalayaal cusub ku dari karaa qaybta **Maamulka**.

## API (kooban)

| Method | Path | Ujeeddo |
|---|---|---|
| POST | `/api/auth/register` | Diiwaan geli |
| POST | `/api/auth/login` | Gal |
| POST | `/api/auth/logout` | Ka bax |
| GET | `/api/auth/me` | Macluumaadka isticmaalaha |
| GET | `/api/dashboard` | Soo koobid guud |
| GET/POST | `/api/wallets` | Wallet-yada |
| PUT/DELETE | `/api/wallets/:id` | Wax ka beddel / tirtir |
| GET/POST | `/api/transactions?month=YYYY-MM` | Dhaqdhaqaaqyada |
| DELETE | `/api/transactions/:id` | Tirtir dhaqdhaqaaq |
| GET/POST | `/api/tasks` | Jadwalka |
| PATCH/DELETE | `/api/tasks/:id` | Dhammee / tirtir |
| GET/POST | `/api/journal` | Wardiga |
| DELETE | `/api/journal/:id` | Tirtir wardi |
| GET | `/api/admin/stats` | Tirakoobka (admin) |
| GET/POST | `/api/admin/users` | Isticmaalayaasha (admin) |
| PATCH/DELETE | `/api/admin/users/:id` | Doorka, xaaladda, tirtir (admin) |

Token-ka waxaa loo diraa qaabka `Authorization: Bearer <token>`.

## Xusuus muhiim ah

- Xogta waxa lagu kaydiyaa `data/db.json`. Tani waa habka fudud ee bilowga; **production** ah waxaa lagu talinayaa database sida PostgreSQL ama MongoDB.
- Ku dar **HTTPS** marka website-ka internet-ka lagu daro.
- Password-yada waxa lagu kaydiyaa qaab la xareeyay (scrypt), ma ahan qoraal cad.
