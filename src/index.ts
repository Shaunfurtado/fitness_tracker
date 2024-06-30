import { serve } from "bun";
import db from "./db";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

serve({
    fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/submit" && request.method === "POST") {
            return handleFormSubmission(request);
        } else if (url.pathname === "/entries" && request.method === "GET") {
            return renderEntriesPage();
        } else if (url.pathname.startsWith("/uploads/")) {
            return serveUploadedFiles(url.pathname);
        } else if (url.pathname.startsWith("/delete/")) {
            const entryId = url.pathname.split("/")[2];
            return deleteEntry(entryId);
        } else {
            return renderFormPage();
        }
    },
    port: 3000,
});

async function handleFormSubmission(request: Request) {
    const formData = await request.formData();
    const date = formData.get("date");

    const images = await Promise.all(
        ["image1", "image2", "image3", "image4"].map(async (imageKey) => {
            const image = formData.get(imageKey) as File;
            if (image) {
                const imageId = uuidv4();
                const imagePath = join("uploads", `${imageId}_${image.name}`);
                writeFileSync(imagePath, new Uint8Array(await image.arrayBuffer()));
                return imagePath;
            }
            return null;
        })
    );

    db.run(
        `INSERT INTO fitness_entries (date, image1, image2, image3, image4) VALUES (?, ?, ?, ?, ?)`,
        date, images[0], images[1], images[2], images[3]
    );

    return new Response(null, {
        status: 302,
        headers: {
            "Location": "/entries",
        },
    });
}

async function renderFormPage() {
    const formHtml = await Bun.file("./src/pages/form.html").text();
    return new Response(formHtml, {
        headers: { "Content-Type": "text/html" },
    });
}

async function renderEntriesPage() {
    const entries = db.query("SELECT * FROM fitness_entries ORDER BY date DESC").all();
    let entriesHtml = await Bun.file("./src/pages/entries.html").text();

    entries.forEach((entry) => {
        entriesHtml += `
            <div class="card">
                <h3>${entry.date}</h3>
                <div class="carousel">
                    ${entry.image1 ? `<img src="/${entry.image1}" alt="Image 1">` : ""}
                    ${entry.image2 ? `<img src="/${entry.image2}" alt="Image 2">` : ""}
                    ${entry.image3 ? `<img src="/${entry.image3}" alt="Image 3">` : ""}
                    ${entry.image4 ? `<img src="/${entry.image4}" alt="Image 4">` : ""}
                </div>
                <button class="delete-entry" data-entry-id="${entry.id}">Delete</button>
            </div>
        `;
    });

    return new Response(entriesHtml, {
        headers: { "Content-Type": "text/html" },
    });
}

async function serveUploadedFiles(pathname: string) {
    const filePath = join(".", pathname);
    try {
        const fileContent = readFileSync(filePath);
        return new Response(fileContent, {
            headers: { "Content-Type": getContentType(filePath) },
        });
    } catch (error) {
        return new Response("File not found", { status: 404 });
    }
}

async function deleteEntry(id: string) {
    const entry = db.query("SELECT * FROM fitness_entries WHERE id = ?", id).first();

    if (!entry) {
        return new Response(null, {
            status: 404,
        });
    }

    // Delete images from filesystem if they exist
    const imagesToDelete = [entry.image1, entry.image2, entry.image3, entry.image4].filter(image => image);
    imagesToDelete.forEach(image => {
        const imagePath = join(".", image);
        try {
            unlinkSync(imagePath);
        } catch (error) {
            console.error(`Error deleting image ${imagePath}:`, error);
        }
    });

    // Delete entry from database
    db.run(`DELETE FROM fitness_entries WHERE id = ?`, id);

    return new Response(null, {
        status: 200,
    });
}


function getContentType(filePath: string): string {
    const extension = filePath.split(".").pop();
    switch (extension) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        default:
            return "application/octet-stream";
    }
}
