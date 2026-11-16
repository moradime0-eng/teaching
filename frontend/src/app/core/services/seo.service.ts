import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class SeoService {
  constructor(
    private title: Title,
    private meta: Meta,
  ) {}

  setTitle(title: string): void {
    this.title.setTitle(`${title} | آموزش همایون`);
  }

  setDescription(description: string): void {
    this.meta.updateTag({ name: 'description', content: description });
  }

  setKeywords(keywords: string): void {
    this.meta.updateTag({ name: 'keywords', content: keywords });
  }

  setOgTags(title: string, description: string, image?: string, url?: string): void {
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    if (image) this.meta.updateTag({ property: 'og:image', content: image });
    if (url) this.meta.updateTag({ property: 'og:url', content: url });
  }

  setFullSeo(data: {
    title: string;
    description: string;
    keywords?: string;
    image?: string;
    url?: string;
  }): void {
    this.setTitle(data.title);
    this.setDescription(data.description);
    if (data.keywords) this.setKeywords(data.keywords);
    this.setOgTags(data.title, data.description, data.image, data.url);
  }
}
