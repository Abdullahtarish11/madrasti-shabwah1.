import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { publicRouter } from './routes/public';
import { authRouter } from './routes/auth';
import { studentRouter } from './routes/student';
import { teacherRouter } from './routes/teacher';
import { adminRouter } from './routes/admin';
import { managerRouter } from './routes/manager';
import { db, UPLOAD_DIR } from './store';
import { currentUser } from './auth';
import { ensureDemoAccounts } from './bootstrap';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/admin', adminRouter);
app.use('/api/manager', managerRouter);

/** Authenticated file access: PDFs, images and recordings uploaded by teachers/admins. */
app.get('/api/files/:name', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'يجب تسجيل الدخول لتنزيل الملفات' });
    return;
  }
  const safeName = path.basename(req.params.name);
  const filePath = path.join(UPLOAD_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'الملف غير موجود' });
    return;
  }
  const record = db.uploads.find((u) => u.path === safeName);
  if (!record) {
    res.status(404).json({ error: 'الملف غير موجود' });
    return;
  }
  res.setHeader('Content-Type', record.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.name)}"`);
  fs.createReadStream(filePath).pipe(res);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'المسار غير موجود' });
});

const clientDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  app.get('/*splat', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (req.path === '/sw.js' || req.path === '/manifest.webmanifest') {
      res.sendFile(path.join(clientDir, path.basename(req.path)));
      return;
    }
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] unhandled error', error.message);
  res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم' });
});

ensureDemoAccounts();

app.listen(PORT, HOST, () => {
  console.log(`Madrasti Shabwah server listening on http://${HOST}:${PORT}`);
});
