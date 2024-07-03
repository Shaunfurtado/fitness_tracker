import { Elysia, t } from 'elysia';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// Define the schema
const fitnessEntries = sqliteTable('fitness_entries', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    image1: text('image1'),
    image2: text('image2'),
    image3: text('image3'),
    image4: text('image4')
  });
  
  // Initialize the database
  const sqlite = new Database('fitness_tracker.sqlite');
  const db = drizzle(sqlite);
  
  // Create the table if it doesn't exist
  db.run(sql`
    CREATE TABLE IF NOT EXISTS fitness_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      image1 TEXT,
      image2 TEXT,
      image3 TEXT,
      image4 TEXT
    );
  `);
  const app = new Elysia()
  .post('/submit', async ({ body, set }) => {
    const { date, image1, image2, image3, image4 } = body;

    const images = await Promise.all(
      [image1, image2, image3, image4].map(async (image) => {
        if (image) {
          const imageId = uuidv4();
          const imagePath = join('uploads', `${imageId}_${image.name}`);
          writeFileSync(imagePath, new Uint8Array(await image.arrayBuffer()));
          return imagePath;
        }
        return null;
      })
    );

    await db.insert(fitnessEntries).values({
      date,
      image1: images[0],
      image2: images[1],
      image3: images[2],
      image4: images[3]
    });

    set.redirect = '/entries';
  }, {
    body: t.Object({
      date: t.String(),
      image1: t.Optional(t.File()),
      image2: t.Optional(t.File()),
      image3: t.Optional(t.File()),
      image4: t.Optional(t.File())
    })
  })
  .get('/entries', async () => {
    try {
      const entries = await db.select().from(fitnessEntries).orderBy(sql`date DESC`);
      const entriesHtml = await Bun.file('./src/pages/entries.html').text();
      
      let entriesContent = '';
      entries.forEach((entry) => {
        entriesContent += `
          <div class="card p-4">
            <h3 class="text-xl font-semibold mb-2">${entry.date}</h3>
            <div class="carousel mb-4">
              ${entry.image1 ? `<img src="/${entry.image1}" alt="Image 1">` : ""}
              ${entry.image2 ? `<img src="/${entry.image2}" alt="Image 2">` : ""}
              ${entry.image3 ? `<img src="/${entry.image3}" alt="Image 3">` : ""}
              ${entry.image4 ? `<img src="/${entry.image4}" alt="Image 4">` : ""}
            </div>
            <button class="btn delete-entry w-full" data-entry-id="${entry.id}">Delete</button>
          </div>
        `;
      });
  
      const finalHtml = entriesHtml.replace('<div id="entries" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">', `<div id="entries" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">${entriesContent}`);
      
      return new Response(finalHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error("Error in /entries route:", error);
      return new Response("An error occurred while loading entries", { status: 500 });
    }
  })
  .get('/uploads/:filename', ({ params: { filename } }) => {
    const filePath = join('.', 'uploads', filename);
    try {
      const fileContent = readFileSync(filePath);
      return new Response(fileContent, {
        headers: { 'Content-Type': getContentType(filePath) }
      });
    } catch (error) {
      return new Response('File not found', { status: 404 });
    }
  })
  .delete('/delete/:id', async ({ params: { id } }) => {
    const entry = await db.select().from(fitnessEntries).where(sql`id = ${id}`).get();

    if (!entry) {
      return new Response(null, { status: 404 });
    }

    // Delete images from filesystem if they exist
    const imagesToDelete = [entry.image1, entry.image2, entry.image3, entry.image4].filter(image => image);
    imagesToDelete.forEach(image => {
      if (image) {
        const imagePath = join('.', image);
        try {
          unlinkSync(imagePath);
        } catch (error) {
          console.error(`Error deleting image ${imagePath}:`, error);
        }
      }
    });

    // Delete entry from database
    await db.delete(fitnessEntries).where(sql`id = ${id}`);

    return new Response(null, { status: 200 });
  })
  .get('/', () => Bun.file('./src/pages/form.html'))
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

function getContentType(filePath: string): string {
  const extension = filePath.split('.').pop();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}