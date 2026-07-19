export type CenterLineProject = {
  version: string;
  template: "center-line";
  preset: string;
  composition: { width: number; height: number; fps: number; duration: number; background: string };
  style: {
    background: string;
    textColor: string;
    emphasisColor: string;
    fontFamily: string;
    fontSize: number;
    transition: "fade";
    historyLines: number;
    echoOpacity: number;
  };
  lines: Array<{ id: string; text: string; start: number; end: number; emphasis?: string[] }>;
  audio?: { voice?: { src: string; start: number; volume: number; source: string } };
};
