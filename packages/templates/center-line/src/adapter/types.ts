/** Template-owned center-line authoring and render contracts. */
export interface CenterLineItem {
  id: string;
  text: string;
  start?: number;
  end?: number;
  emphasis?: string[];
}

export interface CenterLineStoryboard {
  version: string;
  template: "center-line";
  style?: Partial<CenterLineStyle>;
  lines: CenterLineItem[];
}

export interface CenterLineStyle {
  background: string;
  textColor: string;
  emphasisColor: string;
  fontFamily: string;
  fontSize: number;
  transition: "fade";
  historyLines: number;
  echoOpacity: number;
}

export interface CenterLineProject {
  version: string;
  template: "center-line";
  preset: string;
  composition: { width: number; height: number; fps: number; duration: number; background: string };
  style: CenterLineStyle;
  lines: Array<CenterLineItem & { start: number; end: number }>;
  audio?: { voice: { src: string; start: number; volume: number; source: string } };
}
