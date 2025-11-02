const firebaseConfig = {
    apiKey: "AIzaSyAotrOK17wPkD-pBy1XAJjUMKHAkM4UVCk",
    authDomain: "haryanasandhyatimes-59fed.firebaseapp.com",
    projectId: "haryanasandhyatimes-59fed",
    storageBucket: "haryanasandhyatimes-59fed.firebasestorage.app",
    messagingSenderId: "100305210947",
    appId: "1:100305210947:web:e6fb4c2f06be08153e8ef6",
    measurementId: "G-1KZZT24YCL"
  };
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let quill;
let cropper;
let currentImageFile = null;
let croppedImageBlob = null;
let existingAdditionalImages = [];

function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.menu-link').forEach(link => {
        link.classList.remove('active');
    });
    
    document.getElementById(`${sectionName}Section`).classList.add('active');
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    if (sectionName === 'articles') {
        loadArticles();
    } else if (sectionName === 'drafts') {
        loadDrafts();
    } else if (sectionName === 'genres') {
        loadGenres();
    } else if (sectionName === 'reporters') {
        loadReporterApplications();
    } else if (sectionName === 'settings') {
        loadSettings();
    } else if (sectionName === 'dashboard') {
        loadDashboard();
    } else if (sectionName === 'newArticle') {
        resetArticleForm();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminSection').style.display = 'block';
        loadDashboard();
        loadGenresForSelect();
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        document.getElementById('loginSection').style.display = 'flex';
        document.getElementById('adminSection').style.display = 'none';
    } catch (error) {
        alert('Logout failed: ' + error.message);
    }
}

auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminSection').style.display = 'block';
        loadDashboard();
        loadGenresForSelect();
    } else {
        document.getElementById('loginSection').style.display = 'flex';
        document.getElementById('adminSection').style.display = 'none';
    }
});

async function loadDashboard() {
    try {
        const articlesSnapshot = await db.collection('articles').where('status', '==', 'published').get();
        document.getElementById('totalArticles').textContent = articlesSnapshot.size;
        
        const draftsSnapshot = await db.collection('articles').where('status', '==', 'draft').get();
        document.getElementById('totalDrafts').textContent = draftsSnapshot.size;
        
        const applicationsSnapshot = await db.collection('reporterApplications').get();
        document.getElementById('totalApplications').textContent = applicationsSnapshot.size;
        
        const genresSnapshot = await db.collection('genres').get();
        document.getElementById('totalGenres').textContent = genresSnapshot.size;
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function uploadFile(file, path) {
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`${path}/${Date.now()}_${file.name}`);
    await fileRef.put(file);
    return await fileRef.getDownloadURL();
}

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        currentImageFile = file;
        const reader = new FileReader();
        reader.onload = function(event) {
            document.getElementById('previewImg').src = event.target.result;
            document.getElementById('imagePreview').style.display = 'flex';
            document.getElementById('cropBtn').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function openCropModal() {
    const modal = document.getElementById('cropModal');
    const cropImage = document.getElementById('cropImage');
    cropImage.src = document.getElementById('previewImg').src;
    modal.classList.add('active');
    
    if (cropper) {
        cropper.destroy();
    }
    
    cropper = new Cropper(cropImage, {
        aspectRatio: 16 / 9,
        viewMode: 1,
        responsive: true,
        background: false,
    });
}

function closeCropModal() {
    document.getElementById('cropModal').classList.remove('active');
    if (cropper) {
        cropper.destroy();
    }
}

async function applyCrop() {
    const canvas = cropper.getCroppedCanvas();
    canvas.toBlob(blob => {
        croppedImageBlob = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById('previewImg').src = url;
        closeCropModal();
    });
}

async function handleArticleSubmit(e, isDraft = false) {
    e.preventDefault();
    
    const title = document.getElementById('articleTitle').value;
    const tagline = document.getElementById('articleTagline').value;
    const genre = document.getElementById('articleGenre').value;
    const location = document.getElementById('articleLocation').value;
    const reporter = document.getElementById('articleReporter').value;
    const content = quill.root.innerHTML;
    const articleId = document.getElementById('articleId').value;
    const editMode = document.getElementById('editMode').value;
    
    if (!title || !tagline || !genre || !content) {
        alert('Please fill all required fields');
        return;
    }
    
    try {
        let imageUrl = '';
        let additionalImages = [...existingAdditionalImages]; // Use the tracked existing images
        
        // Get existing data if in edit mode
        if (editMode && articleId) {
            const existingDoc = await db.collection('articles').doc(articleId).get();
            const existingData = existingDoc.data();
            imageUrl = existingData.imageUrl;
            // Make sure we have the latest existing additional images
            additionalImages = existingData.additionalImages || [];
        }
        
        // Upload new cropped image if exists
        if (croppedImageBlob) {
            const fileName = `articles/${Date.now()}_${currentImageFile.name}`;
            const storageRef = storage.ref();
            const fileRef = storageRef.child(fileName);
            await fileRef.put(croppedImageBlob);
            imageUrl = await fileRef.getDownloadURL();
        } 
        // Upload new image without crop if exists
        else if (currentImageFile && !croppedImageBlob) {
            imageUrl = await uploadFile(currentImageFile, 'articles');
        }
        
        // Check if we have an image
        if (!imageUrl) {
            alert('Please select an image');
            return;
        }
        
        // Upload NEW additional images if any (append to existing)
        const additionalImageFiles = document.getElementById('additionalImages').files;
        if (additionalImageFiles.length > 0) {
            for (let file of additionalImageFiles) {
                const url = await uploadFile(file, 'articles');
                additionalImages.push(url);
            }
        }
        
        const articleData = {
            title,
            tagline,
            genre,
            location: location || '',
            reporter: reporter || '',
            content,
            imageUrl,
            additionalImages,
            status: isDraft ? 'draft' : 'published',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editMode && articleId) {
            // Editing existing article - preserve publishedDate and createdAt
            await db.collection('articles').doc(articleId).update(articleData);
            alert('Article updated successfully!');
        } else {
            // Creating new article
            articleData.publishedDate = firebase.firestore.FieldValue.serverTimestamp();
            articleData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('articles').add(articleData);
            alert(isDraft ? 'Article saved as draft!' : 'Article published successfully!');
        }
        
        resetArticleForm();
        loadDashboard();
        
    } catch (error) {
        console.error('Error saving article:', error);
        alert('Error saving article: ' + error.message);
    }
}

function resetArticleForm() {
    document.getElementById('articleForm').reset();
    document.getElementById('articleId').value = '';
    document.getElementById('editMode').value = '';
    quill.setContents([]);
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('cropBtn').style.display = 'none';
    document.getElementById('additionalImagesPreview').innerHTML = '';
    document.getElementById('taglineCount').textContent = '0';
    currentImageFile = null;
    croppedImageBlob = null;
    existingAdditionalImages = [];
}

async function loadArticles() {
    try {
        const articlesSnapshot = await db.collection('articles')
            .where('status', '==', 'published')
            .get();
        
        // Convert to array and sort manually
        const articles = [];
        articlesSnapshot.forEach(doc => {
            articles.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by publishedDate descending
        articles.sort((a, b) => {
            const aTime = a.publishedDate ? a.publishedDate.toMillis() : 0;
            const bTime = b.publishedDate ? b.publishedDate.toMillis() : 0;
            return bTime - aTime;
        });
        
        const tbody = document.getElementById('articlesTableBody');
        tbody.innerHTML = '';
        
        articles.forEach(article => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${article.title}</td>
                <td>${article.genre}</td>
                <td>${formatDate(article.publishedDate)}</td>
                <td>${formatDate(article.updatedAt)}</td>
                <td>
                    <button class="action-btn edit" onclick="editArticle('${article.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteArticle('${article.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        if (articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">No articles found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading articles:', error);
    }
}

async function loadDrafts() {
    try {
        const draftsSnapshot = await db.collection('articles')
            .where('status', '==', 'draft')
            .get();
        
        const tbody = document.getElementById('draftsTableBody');
        tbody.innerHTML = '';
        
        // Convert to array and sort manually
        const drafts = [];
        draftsSnapshot.forEach(doc => {
            drafts.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by createdAt descending
        drafts.sort((a, b) => {
            const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
        });
        
        drafts.forEach(article => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${article.title}</td>
                <td>${article.genre}</td>
                <td>${formatDate(article.createdAt)}</td>
                <td>
                    <button class="action-btn edit" onclick="editArticle('${article.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteArticle('${article.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        if (drafts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #666;">No drafts found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading drafts:', error);
    }
}

async function editArticle(articleId) {
    try {
        const doc = await db.collection('articles').doc(articleId).get();
        if (!doc.exists) return;
        
        const article = doc.data();
        
        document.getElementById('articleId').value = articleId;
        document.getElementById('editMode').value = 'true';
        document.getElementById('articleTitle').value = article.title;
        document.getElementById('articleTagline').value = article.tagline;
        document.getElementById('taglineCount').textContent = article.tagline.length;
        document.getElementById('articleGenre').value = article.genre;
        document.getElementById('articleLocation').value = article.location || '';
        document.getElementById('articleReporter').value = article.reporter || '';
        quill.root.innerHTML = article.content;
        
        if (article.imageUrl) {
            document.getElementById('previewImg').src = article.imageUrl;
            document.getElementById('imagePreview').style.display = 'flex';
            document.getElementById('cropBtn').style.display = 'none';
            currentImageFile = null;
            croppedImageBlob = null;
        }
        
        // Display additional images
        if (article.additionalImages && article.additionalImages.length > 0) {
            existingAdditionalImages = [...article.additionalImages];
            const previewContainer = document.getElementById('additionalImagesPreview');
            previewContainer.innerHTML = '';
            article.additionalImages.forEach((url, index) => {
                const div = document.createElement('div');
                div.className = 'additional-image-item';
                div.innerHTML = `
                    <img src="${url}" alt="Additional ${index + 1}">
                    <button type="button" class="remove-additional-image" onclick="removeAdditionalImage(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                previewContainer.appendChild(div);
            });
        }
        
        showSection('newArticle');
        window.scrollTo(0, 0);
    } catch (error) {
        console.error('Error loading article:', error);
    }
}

async function deleteArticle(articleId) {
    if (!confirm('Are you sure you want to delete this article?')) return;
    
    try {
        await db.collection('articles').doc(articleId).delete();
        alert('Article deleted successfully!');
        loadArticles();
        loadDrafts();
        loadDashboard();
    } catch (error) {
        console.error('Error deleting article:', error);
        alert('Error deleting article');
    }
}

async function removeAdditionalImage(index) {
    const articleId = document.getElementById('articleId').value;
    if (!articleId) {
        // If not editing, just remove from preview
        existingAdditionalImages.splice(index, 1);
        const previewContainer = document.getElementById('additionalImagesPreview');
        previewContainer.children[index].remove();
        return;
    }
    
    try {
        const doc = await db.collection('articles').doc(articleId).get();
        const article = doc.data();
        const additionalImages = article.additionalImages || [];
        
        additionalImages.splice(index, 1);
        
        await db.collection('articles').doc(articleId).update({
            additionalImages
        });
        
        // Reload the article to refresh the preview
        editArticle(articleId);
    } catch (error) {
        console.error('Error removing image:', error);
        alert('Error removing image');
    }
}

async function loadGenresForSelect() {
    try {
        const genresSnapshot = await db.collection('genres').get();
        const select = document.getElementById('articleGenre');
        select.innerHTML = '<option value="">Select Genre</option>';
        
        genresSnapshot.forEach(doc => {
            const genre = doc.data();
            const option = document.createElement('option');
            option.value = genre.name;
            option.textContent = genre.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading genres:', error);
    }
}

async function loadGenres() {
    try {
        const genresSnapshot = await db.collection('genres').get();
        const container = document.getElementById('genresList');
        container.innerHTML = '';
        
        genresSnapshot.forEach(doc => {
            const genre = doc.data();
            const div = document.createElement('div');
            div.className = 'genre-item';
            div.innerHTML = `
                <div class="genre-info">
                    <i class="${genre.icon}"></i>
                    <span>${genre.name}</span>
                </div>
                <button class="action-btn delete" onclick="deleteGenre('${doc.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading genres:', error);
    }
}

async function handleGenreSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('genreName').value;
    const icon = document.getElementById('genreIcon').value;
    
    try {
        await db.collection('genres').add({ name, icon });
        alert('Genre added successfully!');
        document.getElementById('genreForm').reset();
        loadGenres();
        loadGenresForSelect();
        loadDashboard();
    } catch (error) {
        console.error('Error adding genre:', error);
        alert('Error adding genre');
    }
}

async function deleteGenre(genreId) {
    if (!confirm('Are you sure you want to delete this genre?')) return;
    
    try {
        await db.collection('genres').doc(genreId).delete();
        alert('Genre deleted successfully!');
        loadGenres();
        loadGenresForSelect();
        loadDashboard();
    } catch (error) {
        console.error('Error deleting genre:', error);
        alert('Error deleting genre');
    }
}

async function loadReporterApplications() {
    try {
        const applicationsSnapshot = await db.collection('reporterApplications').get();
        
        // Convert to array and sort manually
        const applications = [];
        applicationsSnapshot.forEach(doc => {
            applications.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by submittedAt descending
        applications.sort((a, b) => {
            const aTime = a.submittedAt ? a.submittedAt.toMillis() : 0;
            const bTime = b.submittedAt ? b.submittedAt.toMillis() : 0;
            return bTime - aTime;
        });
        
        const tbody = document.getElementById('reportersTableBody');
        tbody.innerHTML = '';
        
        applications.forEach(app => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${app.name}</td>
                <td>${app.email}</td>
                <td>${app.mobile}</td>
                <td>${app.district}</td>
                <td><span class="status-badge ${app.status}">${app.status || 'pending'}</span></td>
                <td>
                    <button class="action-btn view" onclick="viewApplication('${app.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteApplication('${app.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        if (applications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">No applications found</td></tr>';
        }
    } catch (error) {
        console.error('Error loading applications:', error);
    }
}

async function viewApplication(appId) {
    try {
        const doc = await db.collection('reporterApplications').doc(appId).get();
        if (!doc.exists) return;
        
        const app = doc.data();
        const modal = document.getElementById('viewModal');
        const modalBody = document.getElementById('modalBody');
        
        modalBody.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                <div><strong>Name:</strong> ${app.name}</div>
                <div><strong>Gender:</strong> ${app.gender}</div>
                <div><strong>DOB:</strong> ${app.dob}</div>
                <div><strong>Father's Name:</strong> ${app.fatherName}</div>
                <div><strong>Blood Group:</strong> ${app.bloodGroup}</div>
                <div><strong>Aadhar:</strong> ${app.aadhar}</div>
                <div><strong>State:</strong> ${app.state}</div>
                <div><strong>District:</strong> ${app.district}</div>
                <div><strong>Mobile:</strong> ${app.mobile}</div>
                <div><strong>WhatsApp:</strong> ${app.whatsapp}</div>
                <div style="grid-column: 1 / -1;"><strong>Address:</strong> ${app.address}</div>
                <div><strong>Pincode:</strong> ${app.pincode}</div>
                <div><strong>Email:</strong> ${app.email}</div>
                ${app.profilePicUrl ? `<div style="grid-column: 1 / -1;"><strong>Profile:</strong><br><img src="${app.profilePicUrl}" style="max-width: 200px; margin-top: 10px;"></div>` : ''}
                ${app.idProofUrl ? `<div style="grid-column: 1 / -1;"><strong>ID Proof:</strong><br><a href="${app.idProofUrl}" target="_blank">View Document</a></div>` : ''}
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn-primary" onclick="updateApplicationStatus('${appId}', 'approved')">Approve</button>
                <button class="btn-secondary" onclick="updateApplicationStatus('${appId}', 'rejected')">Reject</button>
            </div>
        `;
        
        modal.classList.add('active');
    } catch (error) {
        console.error('Error viewing application:', error);
    }
}

async function updateApplicationStatus(appId, status) {
    try {
        await db.collection('reporterApplications').doc(appId).update({ status });
        alert('Status updated successfully!');
        document.getElementById('viewModal').classList.remove('active');
        loadReporterApplications();
        loadDashboard();
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Error updating status');
    }
}

async function deleteApplication(appId) {
    if (!confirm('Are you sure you want to delete this application?')) return;
    
    try {
        await db.collection('reporterApplications').doc(appId).delete();
        alert('Application deleted successfully!');
        loadReporterApplications();
        loadDashboard();
    } catch (error) {
        console.error('Error deleting application:', error);
        alert('Error deleting application');
    }
}

async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('about').get();
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('settingsName').value = data.name || '';
            document.getElementById('settingsDescription').value = data.description || '';
            
            if (data.imageUrl) {
                document.getElementById('settingsImagePreview').innerHTML = 
                    `<img src="${data.imageUrl}" style="max-width: 200px; margin-top: 10px;">`;
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('settingsName').value;
    const description = document.getElementById('settingsDescription').value;
    const imageFile = document.getElementById('settingsImage').files[0];
    
    try {
        const settingsData = { name, description };
        
        if (imageFile) {
            settingsData.imageUrl = await uploadFile(imageFile, 'settings');
        }
        
        await db.collection('settings').doc('about').set(settingsData, { merge: true });
        alert('Settings saved successfully!');
        loadSettings();
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Error saving settings');
    }
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-IN');
}

document.addEventListener('DOMContentLoaded', () => {
    quill = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                [{ 'font': [] }],
                [{ 'size': ['small', false, 'large', 'huge'] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'script': 'sub'}, { 'script': 'super' }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'indent': '-1'}, { 'indent': '+1' }],
                [{ 'align': [] }],
                ['blockquote', 'code-block'],
                ['link', 'image'],
                ['clean']
            ]
        }
    });
    
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    document.querySelectorAll('.menu-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.closest('.menu-link').getAttribute('data-section');
            showSection(section);
        });
    });
    
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });
    
    document.getElementById('articleImage').addEventListener('change', handleImageSelect);
    document.getElementById('cropBtn').addEventListener('click', openCropModal);
    document.getElementById('closeCropModal').addEventListener('click', closeCropModal);
    document.getElementById('cancelCrop').addEventListener('click', closeCropModal);
    document.getElementById('applyCrop').addEventListener('click', applyCrop);
    
    document.getElementById('additionalImages').addEventListener('change', function(e) {
        const previewContainer = document.getElementById('additionalImagesPreview');
        const files = e.target.files;
        
        // Clear existing previews for new files
        const existingCount = existingAdditionalImages.length;
        
        Array.from(files).forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                const div = document.createElement('div');
                div.className = 'additional-image-item';
                div.innerHTML = `
                    <img src="${event.target.result}" alt="Preview">
                `;
                previewContainer.appendChild(div);
            };
            reader.readAsDataURL(file);
        });
    });
    
    document.getElementById('articleForm').addEventListener('submit', (e) => handleArticleSubmit(e, false));
    document.getElementById('saveDraftBtn').addEventListener('click', (e) => handleArticleSubmit(e, true));
    
    document.getElementById('articleTagline').addEventListener('input', (e) => {
        document.getElementById('taglineCount').textContent = e.target.value.length;
    });
    
    document.getElementById('genreForm').addEventListener('submit', handleGenreSubmit);
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
    
    document.getElementById('closeViewModal').addEventListener('click', () => {
        document.getElementById('viewModal').classList.remove('active');
    });
    
    window.onclick = (e) => {
        const cropModal = document.getElementById('cropModal');
        const viewModal = document.getElementById('viewModal');
        if (e.target === cropModal) {
            closeCropModal();
        }
        if (e.target === viewModal) {
            viewModal.classList.remove('active');
        }
    };
});