/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { I18N } from "@bentley/imodeljs-i18n";
import {
  AbstractWidgetProps,
  StagePanelLocation,
  StagePanelSection,
  StageUsage,
  UiItemsProvider,
} from "@bentley/ui-abstract";
import { PropertyGridProps } from "../property-grid-react";
import * as React from "react";
import { PresentationPropertyGridWidget } from "./PresentationPropertyGridWidget2";

/** Provides the property grid widget to zone 9 */
export class PropertyGridUiItemsProvider implements UiItemsProvider {
  public readonly id = "PropertyGridUiitemsProvider";
  public static i18n: I18N;

  private _props?: Partial<PropertyGridProps>;

  constructor(props?: Partial<PropertyGridProps>) {
    this._props = props;
  }

  public provideWidgets(
    _stageId: string,
    stageUsage: string,
    location: StagePanelLocation,
    section?: StagePanelSection | undefined
  ): ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];
    if (
      stageUsage === StageUsage.General &&
      location === StagePanelLocation.Right &&
      section === StagePanelSection.Start
    ) {
      widgets.push({
        id: "propertyGrid",
        label: "Properties",
        getWidgetContent: () => (
          <PresentationPropertyGridWidget {...this._props} />
        ),
      });
    }

    return widgets;
  }
}
