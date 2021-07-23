/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import * as React from "react";
import {
  AuthorizedFrontendRequestContext,
  IModelApp,
  IModelConnection,
} from "@bentley/imodeljs-frontend";
import { Field } from "@bentley/presentation-common";
import {
  IPresentationPropertyDataProvider,
  PresentationPropertyDataProvider,
  usePropertyDataProviderWithUnifiedSelection,
} from "@bentley/presentation-components";
import {
  FavoritePropertiesScope,
  Presentation,
} from "@bentley/presentation-frontend";
import {
  ActionButtonRenderer,
  ActionButtonRendererProps,
  PropertyData,
  PropertyDataFiltererBase,
  PropertyGridContextMenuArgs,
  PropertyValueRendererManager,
  useAsyncValue,
  VirtualizedPropertyGridWithDataProvider,
} from "@bentley/ui-components";
import {
  ContextMenuItem,
  ContextMenuItemProps,
  FillCentered,
  GlobalContextMenu,
  Icon,
  Orientation,
} from "@bentley/ui-core";
import { UiFramework } from "@bentley/ui-framework";
import { PropertyGridManager } from "../PropertyGridManager";
import { SettingsStatus } from "@bentley/product-settings-client";
import { PropertyRecord } from "@bentley/ui-abstract";
import {
  FilteringPropertyGridWithUnifiedSelection,
  NonEmptyValuesPropertyDataFilterer,
  PlaceholderPropertyDataFilterer,
} from "./FilteringPropertyGrid";
import { copyToClipboard } from "../api/WebUtilities";
import { PropertyGridProps } from "../property-grid-react";
import "./PresentationPropertyGridWidget2.scss";

export type ContextMenuItemInfo = ContextMenuItemProps &
  React.Attributes & { label: string };

const sharedNamespace = "favoriteProperties";
const sharedName = "sharedProps";

// eslint-disable-next-line @typescript-eslint/naming-convention
function FavoriteActionButton({
  field,
  imodel,
}: {
  field: Field;
  imodel: IModelConnection;
}) {
  const isMountedRef = React.useRef(false);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const getIsFavoriteField = React.useCallback(() => {
    return Presentation.favoriteProperties.has(
      field,
      imodel,
      FavoritePropertiesScope.IModel
    );
  }, [field, imodel]);

  const [isFavorite, setIsFavorite] = React.useState(false);

  const toggleFavoriteProperty = React.useCallback(async () => {
    if (getIsFavoriteField()) {
      await Presentation.favoriteProperties.remove(
        field,
        imodel,
        FavoritePropertiesScope.IModel
      );
      isMountedRef.current && setIsFavorite(false);
    } else {
      await Presentation.favoriteProperties.add(
        field,
        imodel,
        FavoritePropertiesScope.IModel
      );
      isMountedRef.current && setIsFavorite(true);
    }
  }, [field, getIsFavoriteField, imodel]);

  const onActionButtonClicked = React.useCallback(async () => {
    void toggleFavoriteProperty();
  }, [toggleFavoriteProperty]);

  return (
    <div onClick={onActionButtonClicked}>
      {isFavorite ? (
        <Icon iconSpec="icon-star" />
      ) : (
        <Icon iconSpec="icon-star" />
      )}
    </div>
  );
}

function createDataProvider(
  imodel: IModelConnection | undefined
): PresentationPropertyDataProvider | undefined {
  if (imodel) {
    const provider = new PresentationPropertyDataProvider({ imodel });
    provider.isNestedPropertyCategoryGroupingEnabled = true;
    return provider;
  }
  return undefined;
}

function useDataProvider(
  iModelConnection: IModelConnection | undefined
): PresentationPropertyDataProvider | undefined {
  const [dataProvider, setDataProvider] = React.useState(
    createDataProvider(iModelConnection)
  );
  React.useEffect(() => {
    setDataProvider(createDataProvider(iModelConnection));
  }, [iModelConnection]);

  return dataProvider;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function PresentationPropertyGridWidget(
  props: Partial<PropertyGridProps>
) {
  const iModelConnection =
    props.iModelConnection ?? UiFramework.getIModelConnection();
  const projectId = props.projectId ?? iModelConnection?.contextId;
  const dataProvider = useDataProvider(iModelConnection);

  const [title, setTitle] = React.useState<PropertyRecord>();
  const [className, setClassName] = React.useState<string>("");
  const [contextMenu, setContextMenu] = React.useState<
    PropertyGridContextMenuArgs | undefined
  >(undefined);
  const [contextMenuItemInfos, setContextMenuItemInfos] = React.useState<
    ContextMenuItemInfo[] | undefined
  >(undefined);
  const [sharedFavorites, setSharedFavorites] = React.useState<string[]>([]);
  const [showNullValues, setShowNullValues] = React.useState<boolean>(true);
  const [filterer, setFilterer] = React.useState<PropertyDataFiltererBase>(
    new PlaceholderPropertyDataFilterer()
  );

  const componentId = "uifw-v2-container";
  const style: React.CSSProperties = {
    height: "100%",
    width: "100%",
    position: "absolute",
    display: "flex",
    flexDirection: "column",
  };

  const localizations = React.useMemo(() => {
    return {
      unshareFavorite: {
        title: PropertyGridManager.translate(
          "context-menu.unshare-favorite.description"
        ),
        label: PropertyGridManager.translate(
          "context-menu.unshare-favorite.label"
        ),
      },
      shareFavorite: {
        title: PropertyGridManager.translate(
          "context-menu.share-favorite.description"
        ),
        label: PropertyGridManager.translate(
          "context-menu.share-favorite.label"
        ),
      },
      removeFavorite: {
        title: PropertyGridManager.translate(
          "context-menu.remove-favorite.description"
        ),
        label: PropertyGridManager.translate(
          "context-menu.remove-favorite.label"
        ),
      },
      addFavorite: {
        title: PropertyGridManager.translate(
          "context-menu.add-favorite.description"
        ),
        label: PropertyGridManager.translate("context-menu.add-favorite.label"),
      },
      copyText: {
        title: PropertyGridManager.translate(
          "context-menu.copy-text.description"
        ),
        label: PropertyGridManager.translate("context-menu.copy-text.label"),
      },
      hideNull: {
        title: PropertyGridManager.translate(
          "context-menu.hide-null.description"
        ),
        label: PropertyGridManager.translate("context-menu.hide-null.label"),
      },
      showNull: {
        title: PropertyGridManager.translate(
          "context-menu.show-null.description"
        ),
        label: PropertyGridManager.translate("context-menu.show-null.label"),
      },
    };
  }, []);

  /**
   * Finds the name of the Favorites category
   * @param propertyRecords
   */
  const getFavoritesCategoryName = React.useCallback(
    async (categories: { [categoryName: string]: PropertyRecord[] }) => {
      const keys = Object.keys(categories);

      for (const key of keys) {
        const category = categories[key];
        for (const record of category) {
          const field = await dataProvider?.getFieldByPropertyRecord(record);
          if (
            field !== undefined &&
            Presentation.favoriteProperties.has(
              field,
              projectId,
              iModelConnection?.iModelId
            )
          ) {
            return key;
          }
        }
      }
      return "Favorite";
    },
    [dataProvider, iModelConnection?.iModelId, projectId]
  );

  const addSharedFavsToData = React.useCallback(
    async (propertyData: PropertyData) => {
      let newSharedFavs: string[] = [];
      if (projectId) {
        const requestContext = await AuthorizedFrontendRequestContext.create();
        const result = await IModelApp.settings.getSharedSetting(
          requestContext,
          sharedNamespace,
          sharedName,
          false,
          projectId,
          iModelConnection?.iModelId
        );
        if (result.setting?.slice) {
          newSharedFavs = (result.setting as string[]).slice();
        }
        setSharedFavorites(newSharedFavs);
      }
      if (propertyData.categories[0]?.name !== "Favorite") {
        propertyData.categories.unshift({
          name: "Favorite",
          label: "Favorite",
          expand: true,
        });
        propertyData.records.Favorite = [];
      }
      const favoritesCategoryName = await getFavoritesCategoryName(
        propertyData.records
      );
      const dataFavs = propertyData.records[favoritesCategoryName];

      for (const cat of propertyData.categories) {
        if (cat.name !== "Favorite") {
          for (const rec of propertyData.records[cat.name]) {
            const propName = rec.property.name;
            const shared =
              newSharedFavs &&
              newSharedFavs?.findIndex(
                (fav: string) => rec.property.name === fav
              ) >= 0;
            if (
              shared &&
              !dataFavs.find(
                (favRec: PropertyRecord) => favRec.property.name === propName
              )
            ) {
              // if shared & not already in favorites
              dataFavs.push(rec);
              const propertyField =
                await dataProvider?.getFieldByPropertyRecord(rec);
              if (propertyField) {
                await Presentation.favoriteProperties.add(
                  propertyField,
                  projectId
                );
              }
            }
          }
        }
      }
      return dataProvider?.getData();
    },
    [
      dataProvider,
      getFavoritesCategoryName,
      iModelConnection?.iModelId,
      projectId,
    ]
  );

  const onDataChanged = React.useCallback(async () => {
    let propertyData: PropertyData | undefined = await dataProvider?.getData();
    if (propertyData) {
      propertyData = await addSharedFavsToData(propertyData);
      setTitle(propertyData?.label);
      setClassName(propertyData?.description ?? "");
    }
  }, [dataProvider, addSharedFavsToData]);

  React.useEffect(() => {
    const mount = async () => {
      dataProvider?.onDataChanged.addListener(onDataChanged);

      let currentData: PropertyData | undefined = await dataProvider?.getData();
      currentData = await addSharedFavsToData(currentData as PropertyData);

      if (currentData) {
        setTitle(currentData.label);
        setClassName(currentData.description ?? "");
      }
    };

    const unmount = () => {
      if (props.debugLog) props.debugLog(`Unmounting Properties Grid`);

      dataProvider?.onDataChanged.removeListener(onDataChanged);
    };

    void mount();

    return unmount;
  }, [onDataChanged, dataProvider, props, addSharedFavsToData]);

  const onAddFavorite = React.useCallback(
    async (propertyField: Field) => {
      if (iModelConnection)
        await Presentation.favoriteProperties.add(
          propertyField,
          iModelConnection,
          FavoritePropertiesScope.IModel
        );
      setContextMenu(undefined);
    },
    [iModelConnection]
  );

  const onRemoveFavorite = React.useCallback(
    async (propertyField: Field) => {
      if (iModelConnection)
        await Presentation.favoriteProperties.remove(
          propertyField,
          iModelConnection,
          FavoritePropertiesScope.IModel
        );
      setContextMenu(undefined);
    },
    [iModelConnection]
  );

  const onShareFavorite = React.useCallback(
    async (propName: string) => {
      if (!projectId || !sharedFavorites) {
        setContextMenu(undefined);
        return;
      }
      sharedFavorites.push(propName);

      const requestContext = await AuthorizedFrontendRequestContext.create();
      const result = await IModelApp.settings.saveSharedSetting(
        requestContext,
        sharedFavorites,
        sharedNamespace,
        sharedName,
        false,
        projectId,
        iModelConnection?.iModelId
      );
      if (result.status !== SettingsStatus.Success) {
        throw new Error(
          "Could not share favoriteProperties: " + result.errorMessage
        );
      }
      const result2 = await IModelApp.settings.getSharedSetting(
        requestContext,
        sharedNamespace,
        sharedName,
        false,
        projectId,
        iModelConnection?.iModelId
      );
      if (result2.status !== SettingsStatus.Success) {
        throw new Error(
          "Could not share favoriteProperties: " + result2.errorMessage
        );
      }
      setContextMenu(undefined);
    },
    [iModelConnection?.iModelId, projectId, sharedFavorites]
  );

  const onUnshareFavorite = React.useCallback(
    async (propName: string) => {
      if (!projectId || !sharedFavorites) {
        setContextMenu(undefined);
        return;
      }
      const index = sharedFavorites.indexOf(propName);
      if (index > -1) {
        sharedFavorites.splice(index, 1);
      }
      const requestContext = await AuthorizedFrontendRequestContext.create();
      const result = await IModelApp.settings.saveSharedSetting(
        requestContext,
        sharedFavorites,
        sharedNamespace,
        sharedName,
        false,
        projectId,
        iModelConnection?.iModelId
      );
      if (result.status !== SettingsStatus.Success) {
        throw new Error(
          "Could not unshare favoriteProperties: " + result.errorMessage
        );
      }
      setContextMenu(undefined);
    },
    [iModelConnection?.iModelId, projectId, sharedFavorites]
  );

  const shareActionButtonRenderer: ActionButtonRenderer = (
    props: ActionButtonRendererProps
  ) => {
    const shared =
      sharedFavorites !== undefined &&
      sharedFavorites?.findIndex(
        (fav: string) => props.property.property.name === fav
      ) >= 0;
    return (
      <div>
        {shared && (
          <span
            className="icon icon-share"
            style={{ paddingRight: "5px" }}
          ></span>
        )}
      </div>
    );
  };

  const onCopyText = React.useCallback(
    async (property: PropertyRecord) => {
      if (property.description) copyToClipboard(property.description);
      else if (props.debugLog)
        props.debugLog(
          "PROPERTIES COPY TEXT FAILED TO RUN DUE TO UNDEFINED PROPERTY RECORD DESCRIPTION"
        );
      setContextMenu(undefined);
    },
    [props]
  );

  const onHideNull = React.useCallback(() => {
    setFilterer(new NonEmptyValuesPropertyDataFilterer());
    setContextMenu(undefined);
    setShowNullValues(false);
  }, []);

  const onShowNull = React.useCallback(() => {
    setFilterer(new PlaceholderPropertyDataFilterer());
    setContextMenu(undefined);
    setShowNullValues(true);
  }, []);

  const setupContextMenu = React.useCallback(
    (args: PropertyGridContextMenuArgs) => {
      if (iModelConnection && dataProvider) {
        void dataProvider
          .getFieldByPropertyRecord(args.propertyRecord)
          .then((field) => {
            const items: ContextMenuItemInfo[] = [];
            if (
              sharedFavorites &&
              sharedFavorites?.findIndex(
                (fav: string) => args.propertyRecord.property.name === fav
              ) >= 0
            ) {
              // i.e. if shared
              items.push({
                key: "unshare-favorite",
                onSelect: () =>
                  onUnshareFavorite(args.propertyRecord.property.name),
                title: localizations.unshareFavorite.title,
                label: localizations.unshareFavorite.label,
              });
            } else if (field !== undefined) {
              if (
                Presentation.favoriteProperties.has(
                  field,
                  iModelConnection,
                  FavoritePropertiesScope.IModel
                )
              ) {
                items.push({
                  key: "share-favorite",
                  onSelect: () =>
                    onShareFavorite(args.propertyRecord.property.name),
                  title: localizations.shareFavorite.title,
                  label: localizations.shareFavorite.label,
                });
                items.push({
                  key: "remove-favorite",
                  icon: "icon-remove-2",
                  onSelect: async () => onRemoveFavorite(field),
                  title: localizations.removeFavorite.title,
                  label: localizations.removeFavorite.label,
                });
              } else {
                items.push({
                  key: "add-favorite",
                  icon: "icon-add",
                  onSelect: async () => onAddFavorite(field),
                  title: localizations.addFavorite.title,
                  label: localizations.addFavorite.label,
                });
              }
            }

            if (props.enableCopyingPropertyText) {
              items.push({
                key: "copy-text",
                onSelect: async () => {
                  if (props.featureTracking)
                    props.featureTracking.trackCopyPropertyText();
                  await onCopyText(args.propertyRecord);
                },
                title: localizations.copyText.title,
                label: localizations.copyText.label,
              });
            }

            if (props.enableNullValueToggle || true) {
              if (showNullValues) {
                items.push({
                  key: "hide-null",
                  onSelect: () => {
                    onHideNull();
                  },
                  title: localizations.hideNull.title,
                  label: localizations.hideNull.label,
                });
              } else {
                items.push({
                  key: "show-null",
                  onSelect: () => {
                    onShowNull();
                  },
                  title: localizations.showNull.title,
                  label: localizations.showNull.label,
                });
              }
            }
            setContextMenu(args);
            setContextMenuItemInfos(items.length > 0 ? items : undefined);
          });
      }
    },
    [
      iModelConnection,
      dataProvider,
      localizations,
      sharedFavorites,
      showNullValues,
      props,
      onAddFavorite,
      onRemoveFavorite,
      onShareFavorite,
      onUnshareFavorite,
      onCopyText,
      onHideNull,
      onShowNull,
    ]
  );

  const onPropertyContextMenu = React.useCallback(
    (args: PropertyGridContextMenuArgs) => {
      args.event.persist();
      setupContextMenu(args);
    },
    [setupContextMenu]
  );

  const onContextMenuOutsideClick = React.useCallback(() => {
    setContextMenu(undefined);
  }, []);

  const onContextMenuEsc = React.useCallback(() => {
    setContextMenu(undefined);
  }, []);

  const favoriteActionButtonRenderer = React.useCallback(
    (props: ActionButtonRendererProps) => {
      if (iModelConnection && dataProvider) {
        const { property } = props;
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const field = useAsyncValue(
          // eslint-disable-next-line react-hooks/rules-of-hooks
          React.useMemo(
            async () => dataProvider.getFieldByPropertyRecord(property),
            [property]
          )
        );

        return (
          <div>
            {field &&
              (Presentation.favoriteProperties.has(
                field,
                iModelConnection,
                FavoritePropertiesScope.IModel
              ) ||
                props.isPropertyHovered) && (
                <FavoriteActionButton field={field} imodel={iModelConnection} />
              )}
          </div>
        );
      }
      return null;
    },
    [dataProvider, iModelConnection]
  );

  const renderHeader = () => {
    return (
      <div className="property-grid-react-panel-header">
        {props.onBackButton !== undefined && (
          <div
            className="property-grid-react-panel-back-btn"
            onClick={props.onBackButton}
          >
            <Icon
              className="property-grid-react-panel-icon"
              iconSpec="icon-progress-backward"
            />
          </div>
        )}
        <div className="property-grid-react-panel-label-and-class">
          {title && PropertyValueRendererManager.defaultManager.render(title)}
          <span className="property-grid-react-panel-class">{className}</span>
        </div>
        {props.onInfoButton !== undefined && (
          <div
            className="property-grid-react-panel-info-btn"
            onClick={props.onInfoButton}
          >
            <Icon
              className="property-grid-react-panel-icon"
              iconSpec="icon-info-hollow"
            />
          </div>
        )}
      </div>
    );
  };

  const renderPropertyGrid = () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { isOverLimit } = usePropertyDataProviderWithUnifiedSelection({
      dataProvider: dataProvider as IPresentationPropertyDataProvider,
    });

    if (isOverLimit) {
      return (
        <FillCentered>
          {IModelApp.i18n.translate(
            "uiTestExtension:properties.too-many-elements-selected"
          )}
        </FillCentered>
      );
    }
    if (dataProvider) {
      if (props.disableUnifiedSelection) {
        return (
          <VirtualizedPropertyGridWithDataProvider
            orientation={props.orientation ?? Orientation.Horizontal}
            isOrientationFixed={props.isOrientationFixed ?? true}
            dataProvider={dataProvider}
            isPropertyHoverEnabled={true}
            isPropertySelectionEnabled={true}
            onPropertyContextMenu={onPropertyContextMenu}
            actionButtonRenderers={[
              shareActionButtonRenderer,
              favoriteActionButtonRenderer,
            ]}
          />
        );
      } else {
        return (
          <FilteringPropertyGridWithUnifiedSelection
            orientation={props.orientation ?? Orientation.Horizontal}
            isOrientationFixed={props.isOrientationFixed ?? true}
            dataProvider={dataProvider}
            filterer={filterer}
            isPropertyHoverEnabled={true}
            isPropertySelectionEnabled={true}
            onPropertyContextMenu={onPropertyContextMenu}
            actionButtonRenderers={[shareActionButtonRenderer]}
          />
        );
      }
    }
    return undefined;
  };

  const renderContextMenu = () => {
    if (!contextMenu || !contextMenuItemInfos) return undefined;

    const items: React.ReactNode[] = [];
    contextMenuItemInfos.forEach((info: ContextMenuItemInfo) =>
      items.push(
        <ContextMenuItem
          key={info.key}
          onSelect={info.onSelect}
          title={info.title}
        >
          {info.label}
        </ContextMenuItem>
      )
    );

    return (
      <GlobalContextMenu
        opened={true}
        onOutsideClick={onContextMenuOutsideClick}
        onEsc={onContextMenuEsc}
        identifier="PropertiesWidget"
        x={contextMenu.event.clientX}
        y={contextMenu.event.clientY}
      >
        {items}
      </GlobalContextMenu>
    );
  };

  return (
    <div
      className={props.rootClassName}
      data-component-id={componentId}
      style={style}
    >
      {renderHeader()}
      <div className="property-grid-container">{renderPropertyGrid()}</div>
      {renderContextMenu()}
    </div>
  );
}
