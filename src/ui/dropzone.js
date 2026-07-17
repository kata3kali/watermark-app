// Dropzone + thumbnail strip.

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

let nextId = 1;

/**
 * callbacks: { onAdd(items), onSelect(id), onRemove(id), onClear() }
 * item shape: { id, file, name, url }
 */
export function initDropzone({ onAdd, onSelect, onRemove, onClear }) {
  const dropzone = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  const thumbs = document.getElementById('thumbs');
  const clearBtn = document.getElementById('clear-all');
  const countEl = document.getElementById('file-count');

  const addFiles = (fileList) => {
    const items = [...fileList]
      .filter((f) => ACCEPTED.includes(f.type))
      .map((file) => ({
        id: nextId++,
        file,
        name: file.name,
        url: URL.createObjectURL(file)
      }));
    if (items.length) onAdd(items);
  };

  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') input.click();
  });
  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  // Also accept drops anywhere on the page.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  clearBtn.addEventListener('click', onClear);

  return {
    /** Re-render the thumbnail strip from the current item list. */
    render(items, selectedId) {
      thumbs.innerHTML = '';
      for (const item of items) {
        const div = document.createElement('div');
        div.className = 'thumb' + (item.id === selectedId ? ' selected' : '');
        div.title = item.name;

        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.name;
        img.draggable = false;

        const label = document.createElement('span');
        label.className = 'thumb-name';
        label.textContent = item.name;

        const rm = document.createElement('button');
        rm.className = 'thumb-remove';
        rm.textContent = '×';
        rm.title = 'Remove';
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          onRemove(item.id);
        });

        div.append(img, label, rm);
        div.addEventListener('click', () => onSelect(item.id));
        thumbs.appendChild(div);
      }
      countEl.textContent = items.length
        ? `${items.length} image${items.length > 1 ? 's' : ''}`
        : '';
      clearBtn.hidden = items.length === 0;
    }
  };
}
